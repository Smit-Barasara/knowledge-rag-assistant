import { describe, expect, it, vi } from 'vitest'
import { ApiError, getJson, request, toApiError } from './client'

describe('API client errors', () => {
  it.each([
    [400, 'offtopic'],
    [404, 'notfound'],
    [422, 'validation'],
    [429, 'ratelimit'],
    [503, 'unavailable'],
  ] as const)('maps HTTP %s to %s', async (status, kind) => {
    const error = await toApiError(new Response(JSON.stringify({ detail: 'No' }), { status }))
    expect(error.kind).toBe(kind)
  })

  it('formats validation detail arrays and retry-after', async () => {
    const error = await toApiError(
      new Response(JSON.stringify({ detail: [{ msg: 'Invalid query' }, { msg: 'Too long' }] }), {
        status: 429,
        headers: { 'Retry-After': '8' },
      }),
    )
    expect(error.message).toBe('Invalid query. Too long')
    expect(error.retryAfter).toBe(8)
  })

  it('returns a visible parse error for invalid success bodies', async () => {
    await expect(getJson('/test', (await import('zod')).z.string(), {
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ no: 'shape' }))),
    })).rejects.toMatchObject({ kind: 'parse' })
  })

  it('distinguishes user aborts from network errors', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(request('/test', { signal: controller.signal, fetchImpl: fetch })).rejects.toMatchObject({
      kind: 'aborted',
    })
    await expect(request('/test', { fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) })).rejects.toMatchObject({
      kind: 'network',
    })
  })

  it('normalizes non-Error runtime values', () => {
    expect(new ApiError('network', 'offline')).toMatchObject({ kind: 'network' })
  })
})
