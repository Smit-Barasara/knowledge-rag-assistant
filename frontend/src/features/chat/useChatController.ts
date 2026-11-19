import { useCallback, useEffect, useRef, useState } from 'react'
import { agent, chat, graph, streamChat } from '../../api/chat'
import { ApiError } from '../../api/client'
import type { Message } from '../../store/conversations'
import { useConversationStore } from '../../store/conversations'
import { useSettingsStore } from '../../store/settings'
import { createId } from '../../lib/id'
import { dedupeSources } from '../../lib/dedupeSources'

export function useChatController() {
  const [busy, setBusy] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const activeReplyRef = useRef<{ conversationId: string; messageId: string } | null>(null)
  const tokenBuffer = useRef('')
  const frameRef = useRef<number | null>(null)

  const flushTokens = useCallback(() => {
    const pending = tokenBuffer.current
    tokenBuffer.current = ''
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    if (!pending || !activeReplyRef.current) return
    const { conversationId, messageId } = activeReplyRef.current
    useConversationStore.getState().updateMessage(conversationId, messageId, (message) => ({
      ...message,
      content: message.content + pending,
      status: 'streaming',
    }))
  }, [])

  const stop = useCallback(() => {
    const active = activeReplyRef.current
    abortRef.current?.abort()
    abortRef.current = null
    if (active) {
      flushTokens()
      useConversationStore.getState().updateMessage(active.conversationId, active.messageId, (message) => ({
        ...message,
        status: 'stopped',
        meta: { ...message.meta, notRemembered: true },
      }))
    }
    activeReplyRef.current = null
    setBusy(false)
  }, [flushTokens])

  const send = useCallback(
    async (rawText: string, retryMessageId?: string) => {
      const text = rawText.trim()
      if (!text || text.length > 2000 || busy) return
      const conversationState = useConversationStore.getState()
      let conversationId = conversationState.activeId
      if (!conversationState.conversations.some((conversation) => conversation.id === conversationId)) {
        conversationId = conversationState.createConversation()
      }
      const conversation = useConversationStore.getState().conversations.find((item) => item.id === conversationId)
      const settings = useSettingsStore.getState()
      const mode = settings.mode
      const controller = new AbortController()
      const now = Date.now()
      let replyId: string

      if (retryMessageId) {
        replyId = retryMessageId
        useConversationStore.getState().updateMessage(conversationId, replyId, (message) => ({
          ...message,
          content: '',
          status: 'pending',
          error: undefined,
          meta: { ...message.meta, notRemembered: false },
        }))
      } else {
        const userMessage: Message = {
          id: createId(),
          role: 'user',
          content: text,
          status: 'done',
          mode,
          createdAt: now,
        }
        replyId = createId()
        useConversationStore.getState().addMessage(conversationId, userMessage)
        useConversationStore.getState().addMessage(conversationId, {
          id: replyId,
          role: 'assistant',
          content: '',
          status: 'pending',
          mode,
          createdAt: now,
        })
      }

      const userMessage = retryMessageId
        ? [...(conversation?.messages ?? [])].reverse().find((message) => message.role === 'user')
        : undefined
      const query = retryMessageId ? (userMessage?.content ?? text) : text
      activeReplyRef.current = { conversationId, messageId: replyId }
      abortRef.current = controller
      tokenBuffer.current = ''
      setBusy(true)
      setElapsedSeconds(0)

      const streamToken = (token: string) => {
        tokenBuffer.current += token
        if (frameRef.current === null) {
          frameRef.current = requestAnimationFrame(flushTokens)
        }
      }
      const onSources = (sources: Parameters<typeof dedupeSources>[0]) => {
        const deduped = dedupeSources(sources)
        useConversationStore.getState().updateMessage(conversationId, replyId, (message) => ({
          ...message,
          sources: deduped,
        }))
      }

      const complete = (content: string, meta: Message['meta'] = {}) => {
        flushTokens()
        useConversationStore.getState().updateMessage(conversationId, replyId, (message) => ({
          ...message,
          content: content || message.content,
          status: 'done',
          meta,
          error: undefined,
        }))
      }

      try {
        if (mode === 'rag') {
          const body = {
            query,
            ...(retryMessageId && conversation?.serverConversationId
              ? { conversation_id: conversation.serverConversationId }
              : !retryMessageId && conversation?.serverConversationId
                ? { conversation_id: conversation.serverConversationId }
                : {}),
            ...(settings.category ? { category_filter: settings.category } : {}),
            ...(settings.topic ? { topic_filter: settings.topic } : {}),
          }
          if (settings.streaming) {
            let streamStarted = false
            let streamCompleted = false
            try {
              await streamChat(
                body,
                {
                  onSources: (sources) => {
                    streamStarted = true
                    onSources(sources)
                  },
                  onToken: (token) => {
                    streamStarted = true
                    streamToken(token)
                  },
                  onDone: (event) => {
                    streamStarted = true
                    streamCompleted = true
                    useConversationStore.getState().setServerConversationId(conversationId, event.conversation_id)
                    complete('', {
                      latencyMs: event.latency_ms,
                      usage: event.usage
                        ? {
                            promptTokens: event.usage.prompt_tokens,
                            completionTokens: event.usage.completion_tokens,
                            totalTokens: event.usage.total_tokens,
                          }
                        : undefined,
                    })
                  },
                },
                controller.signal,
              )
              if (!streamCompleted) throw new ApiError('network', 'The response stream ended before completion.')
            } catch (error) {
              if (!streamStarted && error instanceof ApiError && ['network', 'unavailable'].includes(error.kind)) {
                const response = await chat(body, controller.signal)
                useConversationStore.getState().setServerConversationId(conversationId, response.conversation_id)
                onSources(response.context_sources)
                complete(response.response, {
                  latencyMs: response.latency_ms,
                  usage: {
                    promptTokens: response.token_usage.prompt_tokens,
                    completionTokens: response.token_usage.completion_tokens,
                    totalTokens: response.token_usage.total_tokens,
                  },
                })
              } else {
                throw error
              }
            }
          } else {
            const response = await chat(body, controller.signal)
            useConversationStore.getState().setServerConversationId(conversationId, response.conversation_id)
            onSources(response.context_sources)
            complete(response.response, {
              latencyMs: response.latency_ms,
              usage: {
                promptTokens: response.token_usage.prompt_tokens,
                completionTokens: response.token_usage.completion_tokens,
                totalTokens: response.token_usage.total_tokens,
              },
            })
          }
        } else if (mode === 'agent') {
          const response = await agent(query, controller.signal)
          const counts = response.tool_calls.reduce<Record<string, number>>((result, name) => {
            if (['rag_search', 'get_guidance_document'].includes(name)) {
              result[name] = (result[name] ?? 0) + 1
            }
            return result
          }, {})
          complete(response.response, {
            latencyMs: response.latency_ms,
            usage: {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens: response.usage.total_tokens,
            },
            toolCalls: counts,
          })
        } else {
          const response = await graph(query, controller.signal)
          complete(response.response, {
            latencyMs: response.latency_ms,
            iterations: response.iterations,
            documentsUsed: response.documents_used,
            rewrittenQuery: response.rewritten_query,
          })
        }
      } catch (error) {
        flushTokens()
        if (controller.signal.aborted) {
          useConversationStore.getState().updateMessage(conversationId, replyId, (message) => ({
            ...message,
            status: 'stopped',
            meta: { ...message.meta, notRemembered: true },
          }))
        } else if (error instanceof ApiError && error.kind === 'offtopic') {
          useConversationStore.getState().updateMessage(conversationId, replyId, (message) => ({
            ...message,
            content: error.message,
            status: 'blocked',
            meta: { ...message.meta, notRemembered: true },
          }))
        } else {
          const apiError = error instanceof ApiError ? error : new ApiError('network', 'Something went wrong. Please try again.')
          useConversationStore.getState().updateMessage(conversationId, replyId, (message) => ({
            ...message,
            status: 'error',
            error: {
              kind: apiError.kind,
              message:
                apiError.kind === 'ratelimit'
                  ? `Too many requests. Retry${apiError.retryAfter ? ` in ${apiError.retryAfter} seconds` : ''}.`
                  : apiError.message,
              ...(apiError.retryAfter !== undefined ? { retryAfter: apiError.retryAfter } : {}),
            },
          }))
        }
      } finally {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
        frameRef.current = null
        tokenBuffer.current = ''
        activeReplyRef.current = null
        abortRef.current = null
        setBusy(false)
      }
    },
    [busy, flushTokens],
  )

  const retry = useCallback(
    (messageId: string) => {
      const state = useConversationStore.getState()
      const conversation = state.conversations.find((item) => item.id === state.activeId)
      const index = conversation?.messages.findIndex((message) => message.id === messageId) ?? -1
      const userMessage = index > 0 ? conversation?.messages[index - 1] : undefined
      if (userMessage?.role === 'user') void send(userMessage.content, messageId)
    },
    [send],
  )

  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [busy])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  return { send, retry, stop, busy, elapsedSeconds }
}
