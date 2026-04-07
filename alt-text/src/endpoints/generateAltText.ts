import type { PayloadHandler, PayloadRequest } from 'payload'

import { z, ZodError } from 'zod'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

/**
 * Generates alt text for a single image using the configured resolver.
 *
 * By default, returns the result without updating the document (preview mode).
 * Pass `update: true` in the request body to also persist the generated alt text
 * and keywords to the document — useful for programmatic/agent workflows.
 *
 * The response always includes the `id` and `collection` for easy correlation.
 */
export const generateAltTextEndpoint =
  (access: AltTextPluginConfig['access']): PayloadHandler =>
  async (req: PayloadRequest) => {
    try {
      if (!(await access({ req }))) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const data = 'json' in req && typeof req.json === 'function' ? await req.json() : null

      const requestSchema = z.object({
        id: z.union([z.string(), z.number()]),
        collection: z.string(),
        locale: z.string().nullable(),
        update: z.boolean().optional().default(false),
      })

      const { id, collection, locale, update } = requestSchema.parse(data)

      const imageDoc = await req.payload.findByID({
        id,
        collection,
        depth: 0,
      })

      if (!imageDoc) {
        return Response.json({ error: 'Image not found' }, { status: 404 })
      }

      const pluginConfig = req.payload.config.custom?.altTextPluginConfig as
        | AltTextPluginConfig
        | undefined

      if (!pluginConfig) {
        return Response.json({ error: 'Plugin config not found' }, { status: 500 })
      }

      if (!pluginConfig.getImageThumbnail) {
        return Response.json(
          { error: 'getImageThumbnail function not configured' },
          { status: 500 },
        )
      }

      if (!pluginConfig.resolver) {
        return Response.json({ error: 'No alt text resolver configured' }, { status: 500 })
      }

      const mimeType =
        'mimeType' in imageDoc && typeof imageDoc.mimeType === 'string'
          ? imageDoc.mimeType
          : undefined

      if (
        mimeType &&
        pluginConfig.resolver.supportedMimeTypes &&
        !pluginConfig.resolver.supportedMimeTypes.includes(mimeType)
      ) {
        return Response.json(
          {
            error: `Alt text generation is not supported for files of type "${mimeType}". Supported types: ${pluginConfig.resolver.supportedMimeTypes.join(', ')}.`,
          },
          { status: 400 },
        )
      }

      // determine target locale
      const targetLocale = locale ?? pluginConfig.locale
      if (!targetLocale) {
        return Response.json(
          {
            error:
              'Could not determine target locale for alt text generation. Please check your plugin configuration.',
          },
          { status: 500 },
        )
      }

      const imageThumbnailUrl = pluginConfig.getImageThumbnail(imageDoc)

      const result = await pluginConfig.resolver.resolve({
        filename:
          'filename' in imageDoc && typeof imageDoc.filename === 'string'
            ? imageDoc.filename
            : undefined,
        imageThumbnailUrl,
        locale: targetLocale,
        req,
      })

      if (!result.success) {
        return Response.json(
          { error: result.error || 'Failed to generate alt text' },
          { status: 500 },
        )
      }

      if (update) {
        await req.payload.update({
          id,
          collection,
          data: {
            alt: result.result.altText,
            keywords: result.result.keywords,
          },
          locale: targetLocale,
        })
      }

      return Response.json({ id, collection, ...result.result })
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
      console.error('Error generating alt text:', error)
      return Response.json(
        {
          error: `Error generating alt text: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        { status: 500 },
      )
    }
  }
