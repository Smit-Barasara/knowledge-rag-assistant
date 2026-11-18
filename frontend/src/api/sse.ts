/** Parses JSON `data:` events while preserving arbitrary UTF-8/SSE chunk boundaries. */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown, void, void> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const parseBlock = (block: string): unknown | undefined => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (!data) return undefined
    try {
      return JSON.parse(data)
    } catch {
      return undefined
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      if (buffer.endsWith('\r')) buffer = buffer.slice(0, -1)
      let index = buffer.indexOf('\n\n')
      while (index !== -1) {
        const event = parseBlock(buffer.slice(0, index))
        buffer = buffer.slice(index + 2)
        if (event !== undefined) yield event
        index = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    buffer = buffer.replace(/\r\n/g, '\n').trim()
    const trailing = parseBlock(buffer)
    if (trailing !== undefined) yield trailing
  } finally {
    try {
      await reader.cancel()
    } catch {
      // The stream may already be closed or cancelled by an abort.
    }
  }
}
