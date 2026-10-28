import type { CollectionSlug, PayloadHandler, PayloadRequest, Where } from 'payload'

import pMap from 'p-map'
import { APIError, Forbidden } from 'payload'
import { ZodError } from 'zod'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

import { revalidateAltTextHealthCollection } from '../hooks/revalidateAltTextHealth.js'
import {
  buildMimeTypeWhere,
  getUnsupportedSourceMimeTypeError,
  matchesMimeType,
} from '../utilities/mimeTypes.js'
import { configuredLocales, resolveLocales } from '../utilities/resolveLocales.js'
import { hasAltValue } from '../utilities/summarizeCollection.js'
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

      const { collection, excludeIds, ids, limit, locales, onlyMissing } =
        bulkGenerateAltTextsRequestSchema.parse(data)

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

      // Fail fast only when nothing is configured at all. `filterLocales` is
      // resolved per document below, since the locales a document may be
      // written in can depend on the document (its tenant, say).
      if (configuredLocales(pluginConfig).length === 0) {
        return Response.json(
          {
            error:
              'Could not determine target locales for alt text generation. Please check your plugin configuration.',
          },
          { status: 500 },
        )
      }

      const unconfigured = locales?.filter(
        (locale) => !configuredLocales(pluginConfig).includes(locale),
      )

      if (unconfigured?.length) {
        return Response.json(
          { error: `Locales not configured in the Payload config: ${unconfigured.join(', ')}.` },
          { status: 400 },
        )
      }

      const scope: GenerationScope = { locales, onlyMissing }

      // Bound the batch so a single request cannot fan out into an unbounded
      // number of paid resolver calls.
      const batchSize = ids ? new Set(ids).size : (limit ?? pluginConfig.maxBulkGenerateIds)

      if (batchSize > pluginConfig.maxBulkGenerateIds) {
        return Response.json(
          {
            error: ids
              ? `Too many ids: ${batchSize} exceeds the maximum of ${pluginConfig.maxBulkGenerateIds} per request.`
              : `limit ${batchSize} exceeds the maximum of ${pluginConfig.maxBulkGenerateIds} per request.`,
          },
          { status: 400 },
        )
      }

      // De-duplicated so the same image is never generated (and billed) twice.
      const uniqueIds = ids
        ? [...new Set(ids)]
        : await selectDocsMissingAltText({
            collection,
            excludeIds: excludeIds ?? [],
            limit: batchSize,
            pluginConfig,
            req,
            scope,
          })

      // Also set by documents that fail after a locale was already written.
      let wroteAnyDoc = false

      try {
        await pMap(
          uniqueIds,
          async (id) => {
            try {
              const skipReason = await generateAndUpdateAltText({
                id,
                collection,
                onWrite: () => {
                  wroteAnyDoc = true
                },
                pluginConfig,
                req,
                scope,
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
      } finally {
        // The writes skip the per-write revalidation; one for the whole run
        // replaces them, even when the run is aborted partway.
        if (wroteAnyDoc && pluginConfig.healthCheck && pluginConfig.healthCheckCache) {
          revalidateAltTextHealthCollection(req, collection)
        }
      }

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
 * - `complete` — nothing left to generate: with `onlyMissing`, every target
 *   locale already has alt text, or none of the requested `locales` apply.
 * - `notTracked` — the collection does not track this file type, so it needs no
 *   alt text at all.
 * - `unsupportedFormat` — a tracked file whose format the resolver cannot read.
 *   It still needs alt text; an editor has to write it.
 */
export type SkipReason = 'complete' | 'notTracked' | 'unsupportedFormat'

export type SkippedDoc = { id: number | string; reason: SkipReason }

type Skip = { detail: string; reason: SkipReason }

/** Which locales of an image a run generates for. */
type GenerationScope = {
  /** Narrows each image's target locales to these. */
  locales?: string[]
  /** Leaves out the locales that already have alt text. */
  onlyMissing: boolean
}

type GenerationPlan = { imageDoc: Record<string, unknown>; locales: string[] } | { skip: Skip }

/** Decides what one document would be generated for, without calling the resolver. */
async function planGeneration({
  id,
  collection,
  pluginConfig,
  req,
  scope,
}: {
  collection: CollectionSlug
  id: number | string
  pluginConfig: AltTextPluginConfig
  req: PayloadRequest
  scope: GenerationScope
}): Promise<GenerationPlan> {
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
    throw new Error('Image not found')
  }

  const mimeType =
    'mimeType' in imageDoc && typeof imageDoc.mimeType === 'string' ? imageDoc.mimeType : undefined

  // The handler validates `collection` against the configured collections before
  // reaching this helper, so a matching entry is guaranteed.
  const collectionConfig = pluginConfig.collections.find((entry) => entry.slug === collection)!

  if (mimeType && !matchesMimeType(mimeType, collectionConfig.mimeTypes)) {
    return {
      skip: {
        detail: `alt text is not tracked for files of type "${mimeType}" in the "${collection}" collection`,
        reason: 'notTracked',
      },
    }
  }

  const unsupportedSourceError = getUnsupportedSourceMimeTypeError({
    declaredThumbnailMimeType: collectionConfig.imageThumbnailMimeType,
    mimeType,
    supportedMimeTypes: pluginConfig.resolver.supportedMimeTypes,
  })
  if (unsupportedSourceError) {
    return { skip: { detail: unsupportedSourceError, reason: 'unsupportedFormat' } }
  }

  // Resolved before the resolver runs, so no locale the document may not be
  // written in is ever generated (and billed).
  const targetLocales = (await resolveLocales({ doc: imageDoc, pluginConfig, req })).filter(
    (locale) => !scope.locales || scope.locales.includes(locale),
  )

  if (!scope.onlyMissing) {
    return targetLocales.length > 0
      ? { imageDoc, locales: targetLocales }
      : { skip: { detail: 'none of the requested locales apply', reason: 'complete' } }
  }

  const isLocalized = Boolean(req.payload.config.localization)
  const { alt } = isLocalized
    ? await req.payload.findByID({
        id,
        collection,
        depth: 0,
        fallbackLocale: false,
        locale: 'all',
        overrideAccess: false,
        select: { alt: true },
        user: req.user,
      })
    : (imageDoc as { alt?: unknown })

  const locales = targetLocales.filter(
    (locale) => !hasAltValue(altInLocale(alt, locale, isLocalized)),
  )

  if (locales.length === 0) {
    return {
      skip: { detail: 'every requested target locale already has alt text', reason: 'complete' },
    }
  }

  return { imageDoc, locales }
}

const altInLocale = (alt: unknown, locale: string, isLocalized: boolean): unknown =>
  isLocalized ? (alt as Record<string, unknown> | undefined)?.[locale] : alt

/** Returns why the document was skipped, or `undefined` once it has been written. */
async function generateAndUpdateAltText({
  id,
  collection,
  onWrite,
  pluginConfig,
  req,
  scope,
}: {
  collection: CollectionSlug
  id: number | string
  onWrite: () => void
  pluginConfig: AltTextPluginConfig
  req: PayloadRequest
  scope: GenerationScope
}): Promise<Skip | undefined> {
  const plan = await planGeneration({ id, collection, pluginConfig, req, scope })

  if ('skip' in plan) {
    return plan.skip
  }

  const { imageDoc, locales } = plan
  const collectionConfig = pluginConfig.collections.find((entry) => entry.slug === collection)!

  const imageThumbnailUrl = await pluginConfig.getImageThumbnail(imageDoc, { collection, req })

  const result = await pluginConfig.resolver.resolveBulk({
    filename: typeof imageDoc.filename === 'string' ? imageDoc.filename : undefined,
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
      await req.payload.update({
        id,
        collection,
        // The endpoint revalidates the health cache once for the whole run.
        context: { disableRevalidate: true },
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
      onWrite()
    }
  }
}

const SELECTION_PAGE_SIZE = 500

/**
 * The next `limit` images with a gap in alt text, among those the health report
 * counts: the tracked file types, the user's `read` access and the health check's
 * base filter.
 *
 * Only images the run would actually generate for are picked — not those the
 * resolver cannot read, nor those whose gaps lie outside their own target
 * locales — so they cannot fill every batch and stall a caller working through
 * the library. A document whose planning fails is picked, so the run reports it
 * in `erroredDocs`; the caller passes such documents back as `excludeIds` to
 * read past them.
 */
async function selectDocsMissingAltText({
  collection,
  excludeIds,
  limit,
  pluginConfig,
  req,
  scope,
}: {
  collection: CollectionSlug
  excludeIds: (number | string)[]
  limit: number
  pluginConfig: AltTextPluginConfig
  req: PayloadRequest
  scope: GenerationScope
}): Promise<(number | string)[]> {
  const collectionConfig = pluginConfig.collections.find((entry) => entry.slug === collection)!
  const mimeTypeWhere = buildMimeTypeWhere(collectionConfig.mimeTypes)

  if (!mimeTypeWhere) {
    return []
  }

  const baseFilter = await pluginConfig.healthCheckBaseFilter?.({ collection, req })
  const where: Where =
    baseFilter && Object.keys(baseFilter).length > 0
      ? { and: [mimeTypeWhere, baseFilter] }
      : mimeTypeWhere

  const isLocalized = Boolean(req.payload.config.localization)
  const locales = scope.locales ?? configuredLocales(pluginConfig)
  // Compared as strings: a JSON body may carry a numeric ID as either.
  const excluded = new Set(excludeIds.map(String))
  const selected: (number | string)[] = []

  for (let page = 1; selected.length < limit; page++) {
    const result = await req.payload.find({
      collection,
      depth: 0,
      fallbackLocale: isLocalized ? false : undefined,
      limit: SELECTION_PAGE_SIZE,
      locale: isLocalized ? 'all' : undefined,
      overrideAccess: false,
      page,
      select: { alt: true },
      sort: 'id',
      user: req.user,
      where,
    })

    for (const doc of result.docs) {
      if (selected.length >= limit) {
        break
      }

      if (excluded.has(String(doc.id))) {
        continue
      }

      const alt = 'alt' in doc ? doc.alt : undefined
      const hasGap = locales.some((locale) => !hasAltValue(altInLocale(alt, locale, isLocalized)))

      if (!hasGap) {
        continue
      }

      try {
        const plan = await planGeneration({
          id: doc.id,
          collection,
          pluginConfig,
          req,
          scope,
        })

        if (!('skip' in plan)) {
          selected.push(doc.id)
        }
      } catch {
        selected.push(doc.id)
      }
    }

    if (!result.hasNextPage) {
      break
    }
  }

  return selected
}
