import type { BasePayload, CollectionSlug, PayloadHandler, PayloadRequest } from 'payload'

import pMap from 'p-map'
import { APIError, Forbidden } from 'payload'
import { ZodError } from 'zod'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

import { getUnsupportedSourceMimeTypeError, matchesMimeType } from '../utilities/mimeTypes.js'
import { resolveLocales } from '../utilities/resolveLocales.js'
import { bulkGenerateAltTextsRequestSchema, formatZodError } from './schemas.js'

/**
 * Generates and updates alt text for multiple images in all target locales.
 *
 * Files nothing can be generated for are reported as `skippedDocs` rather than
 * `erroredDocs` — burying them among real failures hides those — each with the
 * reason that decides what the editor has to do next. See {@link SkipReason}.
 */
export const bulkGenerateAltTextsEndpoint =
  (access: AltTextPluginConfig['access']): PayloadHandler =>
  async (req: PayloadRequest) => {
    try {
      if (!(await access({ req }))) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const data = 'json' in req && typeof req.json === 'function' ? await req.json() : null

      const { collection, ids } = bulkGenerateAltTextsRequestSchema.parse(data)

      let updatedDocs = 0
      const erroredDocs: (number | string)[] = []
      const skippedDocs: SkippedDoc[] = []

      // Get plugin config from payload config
      const pluginConfig = req.payload.config.custom?.altTextPluginConfig as
        AltTextPluginConfig | undefined

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

      if (!pluginConfig.resolver) {
        return Response.json({ error: 'No alt text resolver configured' }, { status: 500 })
      }

      const concurrency = pluginConfig.maxBulkGenerateConcurrency

      // De-duplicate so the same image is never generated (and billed) twice,
      // then bound the batch so a single request cannot fan out into an
      // unbounded number of paid resolver calls.
      const uniqueIds = [...new Set(ids)]

      if (uniqueIds.length > pluginConfig.maxBulkGenerateIds) {
        return Response.json(
          {
            error: `Too many ids: ${uniqueIds.length} exceeds the maximum of ${pluginConfig.maxBulkGenerateIds} per request.`,
          },
          { status: 400 },
        )
      }

      const targetLocales = await resolveLocales({ pluginConfig, req })

      if (targetLocales.length === 0) {
        return Response.json(
          {
            error:
              'Could not determine target locales for alt text generation. Please check your plugin configuration.',
          },
          { status: 500 },
        )
      }

      await pMap(
        uniqueIds,
        async (id) => {
          try {
            const skipReason = await generateAndUpdateAltText({
              id,
              collection,
              locales: targetLocales,
              payload: req.payload,
              pluginConfig,
              req,
            })

            if (skipReason) {
              skippedDocs.push({ id, reason: skipReason.reason })
              req.payload.logger.info(`Skipped ${id}: ${skipReason.detail}`)
              return
            }

            updatedDocs++
            req.payload.logger.info(
              `${updatedDocs}/${uniqueIds.length} updated (${Math.round((updatedDocs / uniqueIds.length) * 100)}%)`,
            )
          } catch (error) {
            // A Forbidden means the user has no read/update access to the
            // collection at all — it applies to every id, so fail the whole
            // request with a real 403 instead of silently listing all ids as
            // errored. Row-level NotFound stays a per-doc error (partial success).
            if (error instanceof Forbidden) {
              throw error
            }
            req.payload.logger.error({ err: error }, `Error generating alt text for ${id}`)
            erroredDocs.push(id)
          }
        },
        { concurrency },
      )

      if (erroredDocs.length > 0) {
        req.payload.logger.error(`Failed for: ${erroredDocs.join(', ')}`)
      }

      return Response.json({
        erroredDocs,
        skippedDocs,
        totalDocs: uniqueIds.length,
        updatedDocs,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(formatZodError(error), { status: 400 })
      }
      // Surface Payload access errors (Forbidden 403) with their real status so
      // an agent gets an accurate, non-retryable signal instead of a 500.
      if (error instanceof APIError) {
        return Response.json({ error: error.message }, { status: error.status })
      }
      req.payload.logger.error({ err: error }, 'Error in bulk generation')
      return Response.json(
        {
          error: `Error generating alt text: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        { status: 500 },
      )
    }
  }

/**
 * Why a document was left alone.
 *
 * - `notTracked` — the collection does not track this file type, so it needs no
 *   alt text at all.
 * - `unsupportedFormat` — a tracked file whose format the resolver cannot read.
 *   It still needs alt text; an editor has to write it.
 */
export type SkipReason = 'notTracked' | 'unsupportedFormat'

export type SkippedDoc = { id: number | string; reason: SkipReason }

/** Returns why the document was skipped, or `undefined` once it has been written. */
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
}): Promise<{ detail: string; reason: SkipReason } | undefined> {
  const imageDoc = await payload.findByID({
    id,
    collection,
    depth: 0,
    // Run under the requesting user's access, not Payload's default
    // `overrideAccess: true`, so collection-level access control applies.
    overrideAccess: false,
    user: req.user,
  })

  if (!imageDoc) {
    throw new Error('Image not found')
  }

  const mimeType =
    'mimeType' in imageDoc && typeof imageDoc.mimeType === 'string' ? imageDoc.mimeType : undefined

  // The handler validates `collection` against the configured collections before
  // reaching this helper, so a matching entry is guaranteed.
  const collectionConfig = pluginConfig.collections.find((entry) => entry.slug === collection)!

  if (mimeType && !matchesMimeType(mimeType, collectionConfig.mimeTypes)) {
    return {
      detail: `alt text is not tracked for files of type "${mimeType}" in the "${collection}" collection`,
      reason: 'notTracked',
    }
  }

  const unsupportedSourceError = getUnsupportedSourceMimeTypeError({
    declaredThumbnailMimeType: collectionConfig.imageThumbnailMimeType,
    mimeType,
    supportedMimeTypes: pluginConfig.resolver.supportedMimeTypes,
  })
  if (unsupportedSourceError) {
    return { detail: unsupportedSourceError, reason: 'unsupportedFormat' }
  }

  const imageThumbnailUrl = await pluginConfig.getImageThumbnail(imageDoc, { collection, req })

  const result = await pluginConfig.resolver.resolveBulk({
    filename:
      'filename' in imageDoc && typeof imageDoc.filename === 'string'
        ? imageDoc.filename
        : undefined,
    imageThumbnailMimeType: collectionConfig.imageThumbnailMimeType,
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
        // Run under the requesting user's access, not Payload's default
        // `overrideAccess: true`, so collection-level access control applies.
        overrideAccess: false,
        user: req.user,
      })
    }
  }
}
