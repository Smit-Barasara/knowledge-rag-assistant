import { describe, expect, it } from 'vitest'
import { readSSE } from './sse'

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

describe('readSSE', () => {
  it('parses events split across arbitrary chunk boundaries, including Unicode JSON', async () => {
    const events = []
    for await (const event of readSSE(streamFrom(['data: {"token":"Digi', 'mon \\u26', '00"}\n\n']))) events.push(event)
    expect(events).toEqual([{ token: 'Digimon ☀' }])
  })

  it('parses several CRLF events from one chunk', async () => {
    const events = []
    for await (const event of readSSE(streamFrom(['data: {"token":"a"}\r\n\r\ndata: {"done":true}\r\n\r\n']))) {
      events.push(event)
    }
    expect(events).toEqual([{ token: 'a' }, { done: true }])
  })

  it('ignores malformed JSON and preserves a trailing event without a blank line', async () => {
    const events = []
    for await (const event of readSSE(streamFrom(['data: nope\n\ndata: {"token":"tail"}']))) events.push(event)
    expect(events).toEqual([{ token: 'tail' }])
  })

  it('joins multiple data lines as specified by SSE', async () => {
    const events = []
    for await (const event of readSSE(streamFrom(['data: {"token":\ndata: "joined"}\n\n']))) events.push(event)
    expect(events).toEqual([{ token: 'joined' }])
  })
})
