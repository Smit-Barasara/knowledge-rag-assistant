import {
  DigimonDetailSchema,
  DigimonListItemSchema,
  FiltersSchema,
  HealthSchema,
} from './schemas'
import type { DigimonDetail, DigimonFilters, DigimonListItem, Health } from './schemas'
import { getJson, request } from './client'

export interface DigimonQuery {
  limit: number
  offset: number
  q?: string
  level?: string
  type?: string
  attribute?: string
}

export interface DigimonPage {
  items: DigimonListItem[]
  total: number
}

export async function listDigimon(query: DigimonQuery, signal?: AbortSignal): Promise<DigimonPage> {
  const params = new URLSearchParams({
    limit: String(query.limit),
    offset: String(query.offset),
  })
  for (const key of ['q', 'level', 'type', 'attribute'] as const) {
    const value = query[key]
    if (value) params.set(key, value)
  }
  const response = await request(`/digimon?${params}`, { signal })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('The server returned an invalid Digimon list.')
  }
  const parsed = DigimonListItemSchema.array().safeParse(body)
  if (!parsed.success) throw new Error('The server response did not match the Digimon list format.')
  const total = Number(response.headers.get('X-Total-Count') ?? parsed.data.length)
  return { items: parsed.data, total: Number.isFinite(total) ? total : parsed.data.length }
}

export function getDigimon(id: number, signal?: AbortSignal): Promise<DigimonDetail> {
  return getJson(`/digimon/${id}`, DigimonDetailSchema, { signal })
}

export function getFilters(signal?: AbortSignal): Promise<DigimonFilters> {
  return getJson('/digimon/filters', FiltersSchema, { signal })
}

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return getJson('/health', HealthSchema, { signal, timeoutMs: 10_000 })
}
