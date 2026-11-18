import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDigimon, getFilters, getHealth, listDigimon } from './digimon'

afterEach(() => vi.unstubAllGlobals())

describe('Digimon API', () => {
  it('sends search/filter pagination params and reads total count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 1, name: 'Agumon', level: 'Rookie', type: 'Reptile', attribute: 'Vaccine', image_url: null },
    ]), { headers: { 'X-Total-Count': '41' } }))
    vi.stubGlobal('fetch', fetchMock)
    const page = await listDigimon({ limit: 24, offset: 24, q: 'agu', level: 'Rookie', type: 'Reptile' })
    expect(page.total).toBe(41)
    expect(page.items[0]?.name).toBe('Agumon')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('q=agu')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('type=Reptile')
  })

  it('uses the array length as the total when the header is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 2, name: 'Gabumon', level: null, type: null },
    ]))))
    await expect(listDigimon({ limit: 10, offset: 0 })).resolves.toMatchObject({ total: 1 })
  })

  it('validates detail, filter, and health API response shapes', async () => {
    const responses = [
      { id: 1, name: 'Agumon', level: 'Rookie', type: 'Reptile', attribute: 'Vaccine', description: null, image_url: null },
      { levels: ['Rookie'], types: ['Reptile'], attributes: ['Vaccine'] },
      { status: 'healthy', message: 'Running' },
    ]
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(responses.shift()))))
    await expect(getDigimon(1)).resolves.toMatchObject({ name: 'Agumon' })
    await expect(getFilters()).resolves.toMatchObject({ levels: ['Rookie'] })
    await expect(getHealth()).resolves.toMatchObject({ status: 'healthy' })
  })
})
