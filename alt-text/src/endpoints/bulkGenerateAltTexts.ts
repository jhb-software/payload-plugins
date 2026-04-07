import type { BasePayload, CollectionSlug, PayloadHandler, PayloadRequest } from 'payload'

import pMap from 'p-map'
import { z, ZodError } from 'zod'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

import { localesFromConfig } from '../utilities/localesFromConfig.js'

/**
 * Generates and updates alt text for multiple images in all locales.
 */
export const bulkGenerateAltTextsEndpoint =
  (access: AltTextPluginConfig['access']): PayloadHandler =>
  async (req: PayloadRequest) => {
    try {
      if (!(await access({ req }))) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const data = 'json' in req && typeof req.json === 'function' ? await req.json() : null

      const schema = z.object({
        collection: z.string(),
        ids: z.array(z.union([z.string(), z.number()])),
      })

      const { collection, ids } = schema.parse(data)

      let updatedDocs = 0
      const erroredDocs: (number | string)[] = []

      // Get plugin config from payload config
      const pluginConfig = req.payload.config.custom?.altTextPluginConfig as
        | AltTextPluginConfig
        | undefined

      if (!pluginConfig) {
        return Response.json({ error: 'Plugin config not found' }, { status: 500 })
      }

      if (!pluginConfig.resolver) {
        return Response.json({ error: 'No alt text resolver configured' }, { status: 500 })
      }

      const concurrency = pluginConfig.maxBulkGenerateConcurrency

      // determine target locales based on config
      const locales = localesFromConfig(req.payload.config)
      const targetLocales = locales ?? [pluginConfig.locale!]
      if (!targetLocales) {
        return Response.json(
          {
            error:
              'Could not determine target locales for alt text generation. Please check your plugin configuration.',
          },
          { status: 500 },
        )
      }

      await pMap(
        ids,
        async (id) => {
          try {
            await generateAndUpdateAltText({
              id,
              collection,
              locales: targetLocales,
              payload: req.payload,
              pluginConfig,
              req,
            })
            updatedDocs++
            console.log(
              `${updatedDocs}/${ids.length} updated (${Math.round((updatedDocs / ids.length) * 100)}%)`,
            )
          } catch (error) {
            console.error(`Error generating alt text for ${id}:`, error)
            erroredDocs.push(id)
          }
        },
        { concurrency },
      )

      if (erroredDocs.length > 0) {
        console.error(`Failed for: ${erroredDocs.join(', ')}`)
      }

      return Response.json({
        erroredDocs,
        totalDocs: ids.length,
        updatedDocs,
      })
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
      console.error('Error in bulk generation:', error)
      return Response.json(
        {
          error: `Error generating alt text: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        { status: 500 },
      )
    }
  }

async function generateAndUpdateAltText({
  id,
  collection,
  locales,
  payload,
  pluginConfig,
  req,
}: {
  collection: CollectionSlug
  id: number | string
  locales: string[]
  payload: BasePayload
  pluginConfig: AltTextPluginConfig
  req: PayloadRequest
}) {
  const imageDoc = await payload.findByID({
    id,
    collection,
    depth: 0,
  })

  if (!imageDoc) {
    throw new Error('Image not found')
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
    throw new Error(
      `Alt text generation is not supported for files of type "${mimeType}". Supported types: ${pluginConfig.resolver.supportedMimeTypes.join(', ')}.`,
    )
  }

  const imageThumbnailUrl = pluginConfig.getImageThumbnail(imageDoc)

  const result = await pluginConfig.resolver.resolveBulk({
    filename:
      'filename' in imageDoc && typeof imageDoc.filename === 'string'
        ? imageDoc.filename
        : undefined,
    imageThumbnailUrl,
    locales,
    req,
  })

  if (!result.success) {
    throw new Error(result.error || 'Failed to generate alt text')
  }

  for (const locale of locales) {
    const localeResult = result.results[locale]
    if (localeResult) {
      await payload.update({
        id,
        collection,
        data: {
          alt: localeResult.altText,
          keywords: localeResult.keywords,
        },
        locale,
      })
    }
  }
}
