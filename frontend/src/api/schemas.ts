import { z } from 'zod'

const numberSchema = z.number()

export const ContextSourceSchema = z.object({
  document_id: numberSchema.nullable(),
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

export const GuidanceListItemSchema = z.object({
  id: numberSchema,
  title: z.string(),
  category: z.string(),
  topic: z.string(),
  summary: z.string(),
  source_url: z.string().url(),
  last_verified: z.string(),
})

export const GuidanceDetailSchema = z.object({
  id: numberSchema,
  title: z.string(),
  category: z.string(),
  topic: z.string(),
  summary: z.string(),
  content: z.string(),
  source_url: z.string().url(),
  last_verified: z.string(),
})

export const GuidanceFiltersSchema = z.object({
  categories: z.array(z.string()),
  topics: z.array(z.string()),
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
export type GuidanceListItem = z.infer<typeof GuidanceListItemSchema>
export type GuidanceDetail = z.infer<typeof GuidanceDetailSchema>
export type GuidanceFilters = z.infer<typeof GuidanceFiltersSchema>
export type Health = z.infer<typeof HealthSchema>
export type StreamEvent = z.infer<typeof StreamEventSchema>
