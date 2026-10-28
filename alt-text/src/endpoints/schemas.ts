import type { ZodError } from 'zod'

import { z } from 'zod'

export const generateAltTextRequestSchema = z.object({
  id: z.union([z.string(), z.number()]),
  collection: z.string(),
  locale: z.string().nullable(),
  update: z.boolean().optional().default(false),
})

export const bulkGenerateAltTextsRequestSchema = z
  .object({
    collection: z.string(),
    /** Images to pass over when `ids` is omitted, e.g. those an earlier run reported as errored. */
    excludeIds: z.array(z.union([z.string(), z.number()])).optional(),
    /** Omitted together with `onlyMissing: true`, the endpoint picks the images itself. */
    ids: z.array(z.union([z.string(), z.number()])).optional(),
    /** How many images to pick when `ids` is omitted. Defaults to `maxBulkGenerateIds`. */
    limit: z.number().int().positive().optional(),
    /** Narrows generation to these locales, within each image's own target locales. */
    locales: z.array(z.string()).nonempty().optional(),
    /** Generate only the empty locales and keep the alt texts already written. */
    onlyMissing: z.boolean().optional().default(false),
  })
  .refine((data) => data.ids !== undefined || data.onlyMissing, {
    message: 'Required unless onlyMissing is true',
    path: ['ids'],
  })

export const formatZodError = (error: ZodError) => ({
  details: error.issues.map((e) => ({
    message: e.message,
    path: e.path.join('.'),
  })),
  error: 'Validation failed',
})
