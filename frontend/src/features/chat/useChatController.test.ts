import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { agent, chat, graph, streamChat } from '../../api/chat'
import { useConversationStore } from '../../store/conversations'
import { useSettingsStore } from '../../store/settings'
import { useChatController } from './useChatController'

vi.mock('../../api/chat', () => ({
  agent: vi.fn(),
  chat: vi.fn(),
  graph: vi.fn(),
  streamChat: vi.fn(),
}))

const initialConversation = {
  id: 'conversation-1',
  title: 'New conversation',
  createdAt: 1,
  updatedAt: 1,
  messages: [],
}

function activeMessages() {
  return useConversationStore.getState().conversations.find((conversation) => conversation.id === 'conversation-1')?.messages ?? []
}

describe('useChatController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useConversationStore.setState({ conversations: [initialConversation], activeId: 'conversation-1' })
    useSettingsStore.setState({
      mode: 'rag',
      streaming: true,
      showMetrics: true,
      theme: 'system',
      reduceMotion: null,
      category: '',
      topic: '',
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  it('streams sources and text, then stores server conversation and usage', async () => {
    vi.mocked(streamChat).mockImplementation(async (_body, callbacks) => {
      callbacks.onSources([{ document_id: 1, name: 'Cancelling an IRCTC e-ticket', score: 0.9 }])
      callbacks.onToken('Check the official ')
      callbacks.onToken('cancellation guidance.')
      callbacks.onDone({
        done: true,
        conversation_id: 'server-1',
        latency_ms: 250,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
    })

    const { result } = renderHook(() => useChatController())
    await act(async () => result.current.send(' How do I cancel an e-ticket? '))

    const messages = activeMessages()
    expect(messages.map((message) => message.status)).toEqual(['done', 'done'])
    expect(messages[1]?.content).toBe('Check the official cancellation guidance.')
    expect(messages[1]?.sources).toEqual([{ documentId: 1, name: 'Cancelling an IRCTC e-ticket', score: 0.9 }])
    expect(messages[1]?.meta?.usage?.totalTokens).toBe(15)
    expect(useConversationStore.getState().conversations[0]?.serverConversationId).toBe('server-1')
  })

  it('sends the stored conversation id and only active RAG filters on follow-up', async () => {
    useSettingsStore.getState().setFilters('Tickets', 'Cancellation and refunds')
    vi.mocked(streamChat).mockImplementation(async (_body, callbacks) => {
      callbacks.onDone({ done: true, conversation_id: 'server-followup', latency_ms: 10 })
    })
    const { result } = renderHook(() => useChatController())

    await act(async () => result.current.send('How do I cancel an e-ticket?'))
    await act(async () => result.current.send('What should I check?'))

    expect(vi.mocked(streamChat).mock.calls[0]?.[0]).toEqual({
      query: 'How do I cancel an e-ticket?',
      category_filter: 'Tickets',
      topic_filter: 'Cancellation and refunds',
    })
    expect(vi.mocked(streamChat).mock.calls[1]?.[0]).toEqual({
      query: 'What should I check?',
      conversation_id: 'server-followup',
      category_filter: 'Tickets',
      topic_filter: 'Cancellation and refunds',
    })
  })

  it('renders off-topic 400 as a blocked, not error, response', async () => {
    vi.mocked(streamChat).mockRejectedValue(new ApiError('offtopic', 'Please ask about Indian rail guidance.', 400))
    const { result } = renderHook(() => useChatController())
    await act(async () => result.current.send('What is the capital of France?'))
    expect(activeMessages()[1]).toMatchObject({ status: 'blocked', content: 'Please ask about Indian rail guidance.' })
  })

  it('marks a partial stream failure retryable and retries the same query', async () => {
    vi.mocked(streamChat)
      .mockImplementationOnce(async (_body, callbacks) => {
        callbacks.onToken('Partial answer')
        throw new ApiError('network', 'Network disconnected')
      })
      .mockImplementationOnce(async (_body, callbacks) => {
        callbacks.onDone({ done: true, conversation_id: 'recovered', latency_ms: 25 })
      })

    const { result } = renderHook(() => useChatController())
    await act(async () => result.current.send('How do I cancel an e-ticket?'))
    const reply = activeMessages()[1]
    expect(reply).toMatchObject({ status: 'error', content: 'Partial answer' })

    await act(async () => result.current.retry(reply!.id))
    expect(vi.mocked(streamChat).mock.calls[1]?.[0].query).toBe('How do I cancel an e-ticket?')
    expect(activeMessages()[1]?.status).toBe('done')
  })

  it('stops an in-flight response and marks it as not remembered', async () => {
    let rejectOnAbort: (() => void) | undefined
    vi.mocked(streamChat).mockImplementation((_body, _callbacks, signal) =>
      new Promise<void>((_resolve, reject) => {
        rejectOnAbort = () => reject(new DOMException('Aborted', 'AbortError'))
        signal?.addEventListener('abort', () => rejectOnAbort?.(), { once: true })
      }),
    )
    const { result } = renderHook(() => useChatController())
    act(() => {
      void result.current.send('A long question')
    })
    await waitFor(() => expect(result.current.busy).toBe(true))
    act(() => result.current.stop())
    await waitFor(() => expect(activeMessages()[1]?.status).toBe('stopped'))
    expect(activeMessages()[1]?.meta?.notRemembered).toBe(true)
  })

  it('uses the agent endpoint without filters and displays only known tool counts', async () => {
    useSettingsStore.setState({ mode: 'agent', category: 'Tickets', topic: 'Tatkal' })
    vi.mocked(agent).mockResolvedValue({
      response: 'Check the official IRCTC source.',
      tool_calls: ['rag_search', 'rag_search', 'unknown'],
      usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
      latency_ms: 600,
    })
    const { result } = renderHook(() => useChatController())
    await act(async () => result.current.send('What does the Tatkal guide say?'))
    expect(agent).toHaveBeenCalledWith('What does the Tatkal guide say?', expect.any(AbortSignal))
    expect(activeMessages()[1]?.meta?.toolCalls).toEqual({ rag_search: 2 })
  })

  it('uses corrective RAG metadata without conversation memory', async () => {
    useSettingsStore.setState({ mode: 'graph' })
    vi.mocked(graph).mockResolvedValue({
      response: 'Here is the answer.',
      iterations: 1,
      documents_used: 3,
      latency_ms: 900,
      rewritten_query: 'e-ticket cancellation',
    })
    const { result } = renderHook(() => useChatController())
    await act(async () => result.current.send('Tell me about it'))
    expect(graph).toHaveBeenCalledWith('Tell me about it', expect.any(AbortSignal))
    expect(activeMessages()[1]?.meta).toMatchObject({ iterations: 1, documentsUsed: 3, rewrittenQuery: 'e-ticket cancellation' })
    expect(chat).not.toHaveBeenCalled()
  })
})
