import { z } from 'zod'
import { AgentResponseSchema, ChatResponseSchema, GraphResponseSchema, StreamEventSchema } from './schemas'
import type { AgentResponse, ChatResponse, ContextSource, GraphResponse, StreamEvent } from './schemas'
import { ApiError, getJson, request } from './client'
import { readSSE } from './sse'

export interface ChatRequest {
  query: string
  conversation_id?: string
  category_filter?: string
  topic_filter?: string
}

export interface StreamCallbacks {
  onSources: (sources: ContextSource[]) => void
  onToken: (token: string) => void
  onDone: (event: Extract<StreamEvent, { done: true }>) => void
}

export function chat(body: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  return getJson('/chat', ChatResponseSchema, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
    timeoutMs: 120_000,
  })
}

export function agent(query: string, signal?: AbortSignal): Promise<AgentResponse> {
  return getJson('/agent', AgentResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ query }),
    signal,
    timeoutMs: 120_000,
  })
}

export function graph(query: string, signal?: AbortSignal): Promise<GraphResponse> {
  return getJson('/agent/graph', GraphResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ query }),
    signal,
    timeoutMs: 120_000,
  })
}

export async function streamChat(
  body: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await request('/chat/stream', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
    timeoutMs: 60_000,
  })
  if (!response.body) throw new ApiError('parse', 'The server returned an empty stream.')

  for await (const raw of readSSE(response.body)) {
    const parsed = StreamEventSchema.safeParse(raw)
    if (!parsed.success) continue
    const event = parsed.data
    if ('sources' in event) callbacks.onSources(event.sources)
    else if ('token' in event) callbacks.onToken(event.token)
    else if ('done' in event) callbacks.onDone(event)
    else throw new ApiError('server', event.error)
  }
}

export const ErrorDetailSchema = z.union([z.string(), z.array(z.unknown())])
