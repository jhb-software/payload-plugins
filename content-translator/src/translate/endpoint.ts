import type { PayloadHandler, PayloadRequest } from 'payload'

import { z, ZodError } from 'zod'

import { translateOperation } from './operation.js'

type Access = (args: { req: PayloadRequest }) => boolean | Promise<boolean>

const requestSchema = z.object({
  collectionSlug: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  emptyOnly: z.boolean().optional(),
  globalSlug: z.string().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  locale: z.string(),
  localeFrom: z.string(),
})

export { requestSchema as translateRequestSchema }

export const translateEndpoint =
  (access: Access): PayloadHandler =>
  async (req) => {
    try {
      if (!(await access({ req }))) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const data = await req.json?.()

      if (!data) {
        return Response.json({ error: 'Content-Type should be json' }, { status: 400 })
      }

      const { id, collectionSlug, data: entityData, emptyOnly, globalSlug, locale, localeFrom } =
        requestSchema.parse(data)

      const result = await translateOperation({
        id,
        collectionSlug,
        data: entityData,
        emptyOnly,
        globalSlug,
        locale,
        localeFrom,
        overrideAccess: false,
        req,
        update: false,
      })

      return Response.json(result)
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(
          {
            details: error.issues.map((e) => ({
              message: e.message,
              path: e.path.join('.'),
            })),
            error: 'Validation failed',
          },
          { status: 400 },
        )
      }
      return Response.json(
        {
          error: `Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        { status: 500 },
      )
    }
  }
