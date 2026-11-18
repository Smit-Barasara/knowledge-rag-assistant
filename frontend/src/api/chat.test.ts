import { afterEach, describe, expect, it, vi } from 'vitest'
import { agent, chat, graph, streamChat } from './chat'

afterEach(() => vi.unstubAllGlobals())

describe('chat API', () => {
  it('sends an optional conversation id and filters on the non-streaming RAG endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        response: 'A Rookie Digimon.',
        conversation_id: 'server-1',
        context_sources: [{ digimon_id: 1, name: 'Agumon', score: 0.9 }],
        token_usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        latency_ms: 100,
      })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await chat({ query: 'Tell me about Agumon', conversation_id: 'server-0', level_filter: 'Rookie' })
    expect(result.conversation_id).toBe('server-1')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      query: 'Tell me about Agumon',
      conversation_id: 'server-0',
      level_filter: 'Rookie',
    })
  })

  it('normalizes agent usage and calls agent endpoint without filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        response: 'Answer',
        tool_calls: ['rag_search'],
        usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
        latency_ms: 250,
      })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await agent('Tell me about Agumon')
    expect(result.usage.total_tokens).toBe(6)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/agent')
  })

  it('reads corrective RAG rewrite details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        response: 'Answer',
        iterations: 1,
        documents_used: 3,
        rewritten_query: 'Agumon skills',
        latency_ms: 700,
      })),
    ))
    await expect(graph('What are its skills?')).resolves.toMatchObject({
      rewritten_query: 'Agumon skills',
      documents_used: 3,
    })
  })

  it('dispatches validated stream sources, tokens, and completion', async () => {
    const body = [
      'data: {"sources":[{"digimon_id":1,"name":"Agumon","score":0.8}]}\n\n',
      'data: {"token":"Agumon"}\n\n',
      'data: {"done":true,"conversation_id":"server-1","latency_ms":20}\n\n',
    ].join('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })))
    const onSources = vi.fn()
    const onToken = vi.fn()
    const onDone = vi.fn()
    await streamChat({ query: 'Tell me about Agumon' }, { onSources, onToken, onDone })
    expect(onSources).toHaveBeenCalledWith([{ digimon_id: 1, name: 'Agumon', score: 0.8 }])
    expect(onToken).toHaveBeenCalledWith('Agumon')
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'server-1' }))
  })

  it('rejects a malformed pre-stream error before reading the body as SSE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Only Digimon questions are supported.' }), { status: 400 }),
    ))
    await expect(streamChat({ query: 'What is the capital of France?' }, {
      onSources: vi.fn(),
      onToken: vi.fn(),
      onDone: vi.fn(),
    })).rejects.toMatchObject({ kind: 'offtopic', status: 400 })
  })
})
