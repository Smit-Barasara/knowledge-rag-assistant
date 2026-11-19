import { beforeEach, describe, expect, it } from 'vitest'
import { useConversationStore } from './conversations'

describe('conversation store', () => {
  beforeEach(() => {
    useConversationStore.persist.clearStorage()
    useConversationStore.getState().clearConversations()
  })

  it('caps message history and recovers interrupted messages after rehydration', async () => {
    const state = useConversationStore.getState()
    const activeId = state.activeId
    for (let index = 0; index < 205; index += 1) {
      state.addMessage(activeId, {
        id: `message-${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `message ${index}`,
        status: index === 204 ? 'streaming' : 'done',
        mode: 'rag',
        createdAt: index,
      })
    }
    await useConversationStore.persist.rehydrate()
    const current = useConversationStore.getState().conversations[0]
    expect(current?.messages).toHaveLength(200)
    expect(current?.messages.at(-1)).toMatchObject({ status: 'stopped', meta: { notRemembered: true } })
  })

  it('creates, renames, and deletes conversations without losing the active chat', () => {
    const state = useConversationStore.getState()
    const first = state.activeId
    const second = state.createConversation()
    useConversationStore.getState().renameConversation(second, 'Field notes')
    expect(useConversationStore.getState().conversations[0]?.title).toBe('Field notes')
    useConversationStore.getState().deleteConversation(second)
    expect(useConversationStore.getState().activeId).not.toBe(second)
    expect(useConversationStore.getState().conversations.some((item) => item.id === first)).toBe(true)
  })
})
