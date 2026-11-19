import { HealthSchema } from './schemas'
import type { Health } from './schemas'
import { getJson } from './client'

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return getJson('/health', HealthSchema, { signal, timeoutMs: 10_000 })
}
