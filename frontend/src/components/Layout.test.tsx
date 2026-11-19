import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from './Layout'

vi.mock('../features/status/useHealth', () => ({
  useHealth: () => ({ isSuccess: false, isError: false }),
}))

describe('Layout settings menu', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  it('closes when the user clicks outside the menu', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<button type="button">Outside</button>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const menu = document.querySelector<HTMLDetailsElement>('.settings-menu')!

    await user.click(screen.getByLabelText('Open settings'))
    expect(menu.open).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(menu.open).toBe(false)
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<button type="button">Outside</button>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const menu = document.querySelector<HTMLDetailsElement>('.settings-menu')!

    await user.click(screen.getByLabelText('Open settings'))
    expect(menu.open).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menu.open).toBe(false)
  })
})
