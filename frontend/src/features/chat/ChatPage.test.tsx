import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '../../components/Layout'
import { useConversationStore } from '../../store/conversations'
import { useSettingsStore } from '../../store/settings'
import { ChatPage } from './ChatPage'

vi.mock('../../api/rail-guidance', () => ({
  getGuidanceFilters: vi.fn().mockResolvedValue({ categories: [], topics: [] }),
}))

vi.mock('../status/useHealth', () => ({
  useHealth: () => ({ isSuccess: true, isError: false }),
}))

vi.mock('./useChatController', () => ({
  useChatController: () => ({
    busy: false,
    elapsedSeconds: 0,
    send: vi.fn(),
    stop: vi.fn(),
    retry: vi.fn(),
  }),
}))

describe('ChatPage mode notice', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    useConversationStore.setState({
      conversations: [{
        id: 'conversation-1',
        title: 'Train tickets',
        createdAt: 1,
        updatedAt: Date.now(),
        messages: [{
          id: 'message-1',
          role: 'user',
          content: 'How do I book a train ticket?',
          status: 'done',
          mode: 'rag',
          createdAt: 1,
        }],
      }],
      activeId: 'conversation-1',
    })
    useSettingsStore.setState({ mode: 'rag' })
  })

  it('clears the no-memory notice when switching back to Standard RAG', async () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<ChatPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    expect(await screen.findByText('This mode doesn’t remember earlier messages.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Standard RAG' }))
    await waitFor(() => {
      expect(screen.queryByText('This mode doesn’t remember earlier messages.')).not.toBeInTheDocument()
    })
  })
})
