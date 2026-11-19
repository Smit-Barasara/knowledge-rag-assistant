import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGuidance, getGuidanceFilters, listGuidance } from './rail-guidance'

afterEach(() => vi.unstubAllGlobals())

const guidance = {
  id: 1,
  title: 'Cancelling an IRCTC e-ticket',
  category: 'Tickets',
  topic: 'Cancellation and refunds',
  summary: 'Online cancellation and TDR overview.',
  source_url: 'https://contents.irctc.co.in/en/eticketCancel.html',
  last_verified: '2026-11-18',
}

describe('rail guidance API', () => {
  it('sends search/filter pagination params and reads total count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([guidance]), {
      headers: { 'X-Total-Count': '41' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const page = await listGuidance({
      limit: 12,
      offset: 12,
      q: 'refund',
      category: 'Tickets',
      topic: 'Cancellation and refunds',
    })
    expect(page.total).toBe(41)
    expect(page.items[0]?.title).toBe(guidance.title)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('q=refund')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('category=Tickets')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('topic=Cancellation')
  })

  it('uses the array length when the total-count header is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([guidance]))))
    await expect(listGuidance({ limit: 12, offset: 0 })).resolves.toMatchObject({ total: 1 })
  })

  it('validates detail and filter API response shapes', async () => {
    const detail = { ...guidance, content: 'Check the source before acting.' }
    const responses = [
      detail,
      { categories: ['Tickets'], topics: ['Cancellation and refunds'] },
    ]
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(responses.shift()))))
    await expect(getGuidance(1)).resolves.toMatchObject({ title: guidance.title })
    await expect(getGuidanceFilters()).resolves.toMatchObject({ categories: ['Tickets'] })
  })
})
