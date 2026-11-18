import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createId } from '../lib/id'
import { safeStorage } from './storage'

export type ChatMode = 'rag' | 'agent' | 'graph'
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error' | 'stopped' | 'blocked'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: MessageStatus
  mode: ChatMode
  createdAt: number
  sources?: { digimonId: number | null; name: string; score: number | null }[]
  meta?: {
    latencyMs?: number
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
    toolCalls?: Record<string, number>
    iterations?: number
    documentsUsed?: number
    rewrittenQuery?: string | null
    notRemembered?: boolean
  }
  error?: { kind: string; message: string; retryAfter?: number }
}

export interface Conversation {
  id: string
  serverConversationId?: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
}

interface ConversationState {
  conversations: Conversation[]
  activeId: string
  createConversation: () => string
  setActive: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, messageId: string, update: (message: Message) => Message) => void
  setServerConversationId: (conversationId: string, serverId: string) => void
  renameConversation: (id: string, title: string) => void
  deleteConversation: (id: string) => void
  clearConversations: () => void
}

const INITIAL_ID = createId()
const MAX_CONVERSATIONS = 50
const MAX_MESSAGES = 200

function recoverInterrupted(conversations: Conversation[]): Conversation[] {
  return conversations.slice(0, MAX_CONVERSATIONS).map((conversation) => ({
    ...conversation,
    messages: conversation.messages.slice(-MAX_MESSAGES).map((message) =>
      message.status === 'pending' || message.status === 'streaming'
        ? {
            ...message,
            status: 'stopped',
            meta: { ...message.meta, notRemembered: true },
          }
        : message,
    ),
  }))
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: [{ id: INITIAL_ID, title: 'New conversation', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }],
      activeId: INITIAL_ID,
      createConversation: () => {
        const id = createId()
        const now = Date.now()
        set((state) => ({
          conversations: [{ id, title: 'New conversation', createdAt: now, updatedAt: now, messages: [] }, ...state.conversations].slice(
            0,
            MAX_CONVERSATIONS,
          ),
          activeId: id,
        }))
        return id
      },
      setActive: (id) => set({ activeId: id }),
      addMessage: (conversationId, message) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) => {
            if (conversation.id !== conversationId) return conversation
            const messages = [...conversation.messages, message].slice(-MAX_MESSAGES)
            const firstUser = messages.find((entry) => entry.role === 'user')
            return {
              ...conversation,
              title: conversation.title === 'New conversation' && firstUser ? firstUser.content.slice(0, 40) : conversation.title,
              updatedAt: Date.now(),
              messages,
            }
          }),
        })),
      updateMessage: (conversationId, messageId, update) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id !== conversationId
              ? conversation
              : {
                  ...conversation,
                  updatedAt: Date.now(),
                  messages: conversation.messages.map((message) => (message.id === messageId ? update(message) : message)),
                },
          ),
        })),
      setServerConversationId: (conversationId, serverId) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, serverConversationId: serverId } : conversation,
          ),
        })),
      renameConversation: (id, title) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === id ? { ...conversation, title: title.trim().slice(0, 60) || conversation.title } : conversation,
          ),
        })),
      deleteConversation: (id) => {
        const remaining = get().conversations.filter((conversation) => conversation.id !== id)
        const nextId = remaining[0]?.id ?? createId()
        const next =
          remaining.length > 0
            ? remaining
            : [{ id: nextId, title: 'New conversation', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }]
        set({ conversations: next, activeId: get().activeId === id ? nextId : get().activeId })
      },
      clearConversations: () => {
        const id = createId()
        const now = Date.now()
        set({ conversations: [{ id, title: 'New conversation', createdAt: now, updatedAt: now, messages: [] }], activeId: id })
      },
    }),
    {
      name: 'digimon-rag-conversations',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ conversations: state.conversations, activeId: state.activeId }),
      migrate: (persisted) => {
        if (typeof persisted !== 'object' || persisted === null || !('conversations' in persisted)) {
          return { conversations: [], activeId: '' } as Pick<ConversationState, 'conversations' | 'activeId'>
        }
        const value = persisted as { conversations?: Conversation[]; activeId?: string }
        const conversations = Array.isArray(value.conversations) ? recoverInterrupted(value.conversations) : []
        const activeId = conversations.some((conversation) => conversation.id === value.activeId)
          ? value.activeId!
          : (conversations[0]?.id ?? '')
        return { conversations, activeId }
      },
      merge: (persisted, current) => {
        const value = persisted as Partial<Pick<ConversationState, 'conversations' | 'activeId'>>
        const conversations = Array.isArray(value.conversations) ? recoverInterrupted(value.conversations) : current.conversations
        const activeId =
          conversations.some((conversation) => conversation.id === value.activeId) ? value.activeId : conversations[0]?.id
        return { ...current, conversations, activeId: activeId ?? current.activeId }
      },
    },
  ),
)
