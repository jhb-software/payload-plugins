import type { PayloadHandler, PayloadRequest } from 'payload'

import { APIError } from 'payload'
import { ZodError } from 'zod'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

import { matchesMimeType } from '../utilities/mimeTypes.js'
import { formatZodError, generateAltTextRequestSchema } from './schemas.js'

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

      const { id, collection, locale, update } = generateAltTextRequestSchema.parse(data)

      const pluginConfig = req.payload.config.custom?.altTextPluginConfig as
        | AltTextPluginConfig
        | undefined

      if (!pluginConfig) {
        return Response.json({ error: 'Plugin config not found' }, { status: 500 })
      }

      // Treat the configured collections as an allowlist. Reject any other
      // collection before touching the Local API, so the endpoint can only ever
      // operate on the upload collections the plugin manages.
      const collectionConfig = pluginConfig.collections.find((entry) => entry.slug === collection)

      if (!collectionConfig) {
        return Response.json(
          { error: `Collection "${collection}" is not managed by the alt text plugin.` },
          { status: 403 },
        )
      }

      const imageDoc = await req.payload.findByID({
        id,
        collection,
        depth: 0,
        // Run under the requesting user's access, not Payload's default
        // `overrideAccess: true`, so collection-level access control applies.
        overrideAccess: false,
        user: req.user,
      })

      if (!imageDoc) {
        return Response.json({ error: 'Image not found' }, { status: 404 })
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

      if (mimeType && !matchesMimeType(mimeType, collectionConfig.mimeTypes)) {
        return Response.json(
          {
            error: `Alt text is not tracked for files of type "${mimeType}" in the "${collection}" collection. Tracked types: ${collectionConfig.mimeTypes.join(', ')}.`,
          },
          { status: 400 },
        )
      }

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
          // Run under the requesting user's access, not Payload's default
          // `overrideAccess: true`, so collection-level access control applies.
          overrideAccess: false,
          user: req.user,
        })
      }

      return Response.json({ id, collection, ...result.result })
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(formatZodError(error), { status: 400 })
      }
      // Surface Payload access errors (Forbidden 403 / NotFound 404) with their
      // real status so an agent gets an accurate, non-retryable signal instead
      // of a misleading 500.
      if (error instanceof APIError) {
        return Response.json({ error: error.message }, { status: error.status })
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
