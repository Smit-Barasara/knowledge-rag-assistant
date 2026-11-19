import type { z } from 'zod'
import { env } from '../config/env'

export type ApiErrorKind =
  | 'offtopic'
  | 'validation'
  | 'ratelimit'
  | 'server'
  | 'unavailable'
  | 'network'
  | 'aborted'
  | 'parse'
  | 'notfound'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly retryAfter?: number

  constructor(
    kind: ApiErrorKind,
    message: string,
    status?: number,
    retryAfter?: number,
  ) {
    super(message)
    this.kind = kind
    if (status !== undefined) this.status = status
    if (retryAfter !== undefined) this.retryAfter = retryAfter
    this.name = 'ApiError'
  }
}

interface RequestOptions extends Omit<RequestInit, 'signal'> {
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const normalizeDetail = (detail: unknown): string => {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => {
      if (typeof item === 'string') return [item]
      if (typeof item === 'object' && item !== null && 'msg' in item && typeof item.msg === 'string') {
        return [item.msg]
      }
      return []
    })
    if (messages.length > 0) return messages.join('. ')
  }
  return 'The request could not be completed.'
}

export async function toApiError(response: Response): Promise<ApiError> {
  let detail: unknown
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body) detail = body.detail
  } catch {
    detail = undefined
  }

  const message = normalizeDetail(detail)
  const kind: ApiErrorKind =
    response.status === 400
      ? 'offtopic'
      : response.status === 404
        ? 'notfound'
        : response.status === 422
          ? 'validation'
          : response.status === 429
            ? 'ratelimit'
            : response.status >= 500
              ? 'unavailable'
              : 'server'
  const retryHeader = response.headers.get('Retry-After')
  const retryAfter = retryHeader ? Number(retryHeader) : undefined
  return new ApiError(
    kind,
    message,
    response.status,
    retryAfter !== undefined && Number.isFinite(retryAfter) ? retryAfter : undefined,
  )
}

export async function request(
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const { signal, timeoutMs = 30_000, fetchImpl = fetch, ...init } = options
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetchImpl(`${env.VITE_API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) throw await toApiError(response)
    return response
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (signal?.aborted) throw new ApiError('aborted', 'Request stopped.')
    if (timedOut) throw new ApiError('unavailable', 'The server took too long to respond.')
    throw new ApiError('network', 'Unable to reach the server.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function getJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const response = await request(path, options)
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('parse', 'The server returned an invalid response.')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    if (import.meta.env.DEV) console.error('API response validation failed', parsed.error.issues)
    throw new ApiError('parse', 'The server response did not match the expected format.')
  }
  return parsed.data
}
