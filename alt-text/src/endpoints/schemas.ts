import type { ZodError } from 'zod'

import { z } from 'zod'

export const generateAltTextRequestSchema = z.object({
  id: z.union([z.string(), z.number()]),
  collection: z.string(),
  locale: z.string().nullable(),
  update: z.boolean().optional().default(false),
})

export const bulkGenerateAltTextsRequestSchema = z.object({
  collection: z.string(),
  ids: z.array(z.union([z.string(), z.number()])),
})

export const formatZodError = (error: ZodError) => ({
  details: error.issues.map((e) => ({
    message: e.message,
    path: e.path.join('.'),
  })),
  error: 'Validation failed',
})
