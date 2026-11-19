import { z } from 'zod'

const EnvironmentSchema = z.object({
  VITE_API_BASE_URL: z.string().trim().min(1).default('/api/v1'),
})

export const env = EnvironmentSchema.parse(import.meta.env)
