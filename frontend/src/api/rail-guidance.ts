import {
  GuidanceDetailSchema,
  GuidanceFiltersSchema,
  GuidanceListItemSchema,
} from './schemas'
import type { GuidanceDetail, GuidanceFilters, GuidanceListItem } from './schemas'
import { getJson, request } from './client'

export interface GuidanceQuery {
  limit: number
  offset: number
  q?: string
  category?: string
  topic?: string
}

export interface GuidancePage {
  items: GuidanceListItem[]
  total: number
}

export async function listGuidance(query: GuidanceQuery, signal?: AbortSignal): Promise<GuidancePage> {
  const params = new URLSearchParams({
    limit: String(query.limit),
    offset: String(query.offset),
  })
  for (const key of ['q', 'category', 'topic'] as const) {
    const value = query[key]
    if (value) params.set(key, value)
  }
  const response = await request(`/rail/guidance?${params}`, { signal })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('The server returned an invalid guidance list.')
  }
  const parsed = GuidanceListItemSchema.array().safeParse(body)
  if (!parsed.success) throw new Error('The server response did not match the guidance list format.')
  const total = Number(response.headers.get('X-Total-Count') ?? parsed.data.length)
  return { items: parsed.data, total: Number.isFinite(total) ? total : parsed.data.length }
}

export function getGuidance(id: number, signal?: AbortSignal): Promise<GuidanceDetail> {
  return getJson(`/rail/guidance/${id}`, GuidanceDetailSchema, { signal })
}

export function getGuidanceFilters(signal?: AbortSignal): Promise<GuidanceFilters> {
  return getJson('/rail/guidance/filters', GuidanceFiltersSchema, { signal })
}
