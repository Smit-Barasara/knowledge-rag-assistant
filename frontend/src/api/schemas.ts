import { z } from 'zod'

const numberSchema = z.number()

export const ContextSourceSchema = z.object({
  digimon_id: numberSchema.nullable(),
  name: z.string().nullable(),
  score: numberSchema.nullable(),
})

export const ChatResponseSchema = z.object({
  response: z.string(),
  conversation_id: z.string(),
  context_sources: z.array(ContextSourceSchema),
  token_usage: z
    .object({
      prompt_tokens: numberSchema,
      completion_tokens: numberSchema,
      total_tokens: numberSchema,
    })
    .partial()
    .default({}),
  latency_ms: numberSchema,
})

export const AgentResponseSchema = z.object({
  response: z.string(),
  tool_calls: z.array(z.string()),
  usage: z.object({
    input_tokens: numberSchema,
    output_tokens: numberSchema,
    total_tokens: numberSchema,
  }),
  latency_ms: numberSchema,
})

export const GraphResponseSchema = z.object({
  response: z.string(),
  iterations: numberSchema,
  documents_used: numberSchema,
  latency_ms: numberSchema,
  rewritten_query: z.string().nullable().optional(),
})

export const DigimonListItemSchema = z.object({
  id: numberSchema,
  name: z.string(),
  level: z.string().nullable(),
  type: z.string().nullable(),
  attribute: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
})

export const DigimonDetailSchema = z.object({
  id: numberSchema,
  name: z.string(),
  level: z.string().nullable(),
  type: z.string().nullable(),
  attribute: z.string().nullable(),
  description: z.string().nullable(),
  image_url: z.string().nullable(),
})

export const FiltersSchema = z.object({
  levels: z.array(z.string()),
  types: z.array(z.string()),
  attributes: z.array(z.string()),
})

export const HealthSchema = z.object({
  status: z.string(),
  message: z.string(),
})

export const StreamEventSchema = z.union([
  z.object({ sources: z.array(ContextSourceSchema) }),
  z.object({ token: z.string() }),
  z.object({
    done: z.literal(true),
    conversation_id: z.string(),
    latency_ms: numberSchema,
    usage: z
      .object({
        prompt_tokens: numberSchema,
        completion_tokens: numberSchema,
        total_tokens: numberSchema,
      })
      .optional(),
  }),
  z.object({ error: z.string() }),
])

export type ContextSource = z.infer<typeof ContextSourceSchema>
export type ChatResponse = z.infer<typeof ChatResponseSchema>
export type AgentResponse = z.infer<typeof AgentResponseSchema>
export type GraphResponse = z.infer<typeof GraphResponseSchema>
export type DigimonListItem = z.infer<typeof DigimonListItemSchema>
export type DigimonDetail = z.infer<typeof DigimonDetailSchema>
export type DigimonFilters = z.infer<typeof FiltersSchema>
export type Health = z.infer<typeof HealthSchema>
export type StreamEvent = z.infer<typeof StreamEventSchema>
