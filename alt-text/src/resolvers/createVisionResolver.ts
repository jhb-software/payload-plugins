import type { PayloadRequest } from 'payload'

import { z } from 'zod'

import type {
  AltTextBulkResolverArgs,
  AltTextBulkResolverResponse,
  AltTextResolver,
  AltTextResolverArgs,
  AltTextResolverResponse,
  AltTextResult,
} from './types.js'

export type VisionInstructionsArgs = {
  /** The instructions the resolver would send on its own, stating the rules the plugin depends on */
  defaultInstructions: string
  /** The uploaded file's name, when the endpoint could supply one */
  filename?: string
  /** The locales the response must cover, as configured in Payload */
  locales: string[]
}

export type VisionInstructions = (args: VisionInstructionsArgs) => Promise<string> | string

/** The thumbnail's bytes, handed to providers that declared `inlineImage`. */
export type VisionImage = {
  /** Base64-encoded bytes, without a data URI prefix */
  base64: string
  /** `data:<mediaType>;base64,<base64>`, for providers that take a data URI */
  dataUri: string
  /** The format actually served at the thumbnail URL, not the document's stored one */
  mediaType: string
}

export type VisionGenerateArgs = {
  /** The uploaded file's name, when the endpoint could supply one */
  filename?: string
  /** The downloaded thumbnail — present only when the resolver declared `inlineImage` */
  image?: VisionImage
  /**
   * The format the collection declares `getImageThumbnail` delivers, or
   * undefined when nothing was declared. Resolvers that inline the bytes should
   * use `image.mediaType`, which is what the URL actually served, with this
   * declaration already standing in when the host named no usable type.
   */
  imageThumbnailMimeType?: string
  /** URL of the image thumbnail, for providers that fetch it themselves */
  imageThumbnailUrl: string
  /** The instructions to send, e.g. as the system prompt */
  instructions: string
  /** The locales the response must cover */
  locales: string[]
  /** Token budget for the response, scaled by the number of requested locales */
  maxTokens: number
  req: PayloadRequest
  /** Draft-7 JSON Schema of the object the provider must return */
  responseSchema: Record<string, unknown>
  /**
   * Aborts once `timeoutMs` has elapsed, already covering the image download.
   * Undefined when the resolver declares no `timeoutMs`, leaving the deadline to
   * the provider client.
   */
  signal?: AbortSignal
}

export type VisionResolverConfig = {
  /**
   * Checked before any work happens, so a plugin wired as
   * `enabled: !!process.env.X_API_KEY` fails with a readable message instead of
   * a provider error — or, worse, a paid-for image download.
   */
  apiKey: string
  /**
   * Sends one request to the provider and returns its parsed JSON response.
   * Throwing fails the generation, so provider errors need no special handling.
   */
  generate: (args: VisionGenerateArgs) => unknown
  /**
   * Download the thumbnail and hand `generate` the bytes rather than the URL.
   *
   * Needed by every provider whose own fetcher requires a publicly reachable
   * file — never true in local development, not true for private buckets.
   */
  inlineImage?: boolean
  /**
   * Builds the instructions from the default ones, e.g. to append a house style
   * rule. Called once per generation. The image and the required response shape
   * are not part of the instructions and cannot be altered here.
   *
   * @default ({ defaultInstructions }) => defaultInstructions
   */
  instructions?: VisionInstructions
  /** Identifies the resolver, e.g. in log entries */
  key: string
  /** Provider name used in error messages shown in the admin UI */
  label: string
  /**
   * Rejects an inlined image above this size before it is sent.
   * @default 20971520 (20 MB)
   */
  maxImageBytes?: number
  /**
   * Token budget granted per requested locale. A ceiling, not a reservation, so
   * headroom is free; the default keeps the pre-factory bulk budget of 300 for
   * every locale count rather than only for two or more.
   * @default 300
   */
  maxTokensPerLocale?: number
  /** @see AltTextResolver.supportedMimeTypes */
  supportedMimeTypes?: string[]
  /**
   * Abort after this many milliseconds, covering the image download and the
   * provider call together. Omit it to impose no deadline of the factory's own —
   * appropriate when the provider's own client already has one.
   */
  timeoutMs?: number
}

const altTextSchema = z.object({
  altText: z.string().describe('A concise, descriptive alt text for the image'),
  keywords: z.array(z.string()).describe('Keywords that describe the content of the image'),
})

/** One schema entry per requested locale, so the model must answer for all of them. */
export const schemaForLocales = (locales: string[]) =>
  z.object(Object.fromEntries(locales.map((locale) => [locale, altTextSchema])))

/**
 * Rules dictated by the plugin rather than by the provider: one entry per
 * configured locale, describing what is visible rather than guessing at it.
 */
const buildDefaultInstructions = ({ locales }: { locales: string[] }): string =>
  [
    `You are an expert at analyzing images and creating descriptive image alt text.`,

    `Please analyze the given image and provide the following in ${locales.join(', ')}:`,

    `- A concise, localized descriptive alt text (1-2 sentences) as "altText". Focus on the subject, action, and setting. Avoid phrases like 'Image of', 'A picture of', or 'Photo showing'. Be specific and include relevant details like location or context if visible. Make no assumptions.`,

    `- A localized list of keywords that describe the content (e.g., ["Camel", "Palm trees", "Desert"]) as "keywords"`,

    `If a context is provided, use it to enhance the alt text.`,

    `Format your response as a JSON object with ${locales.map((locale) => `"${locale}"`).join(', ')} keys, each containing "altText" and "keywords".`,
  ].join('\n\n')

/**
 * Downloads the image and returns its bytes.
 *
 * The document's mime type is checked by the endpoint before the resolver runs,
 * but `getImageThumbnail` may point at a derivative in a different format, so
 * what was actually served is what counts. Only when the host names no usable
 * type at all — no header, or a generic `application/octet-stream` as private
 * buckets and signed URLs often send — does the collection's declared
 * `imageThumbnailMimeType` stand in for it.
 */
async function fetchImage({
  declaredMediaType,
  label,
  maxImageBytes,
  signal,
  supportedMimeTypes,
  url,
}: {
  declaredMediaType?: string
  label: string
  maxImageBytes: number
  signal?: AbortSignal
  supportedMimeTypes?: string[]
  url: string
}): Promise<{ error: string } | { image: VisionImage }> {
  let response: Response

  try {
    response = await fetch(url, { signal })
  } catch (error) {
    return {
      error: `Could not download the image from ${url}: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }

  if (!response.ok) {
    return { error: `Could not download the image from ${url}: status ${response.status}` }
  }

  const served = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const mediaType =
    served && served !== 'application/octet-stream' ? served : declaredMediaType?.toLowerCase()

  if (!mediaType || (supportedMimeTypes && !supportedMimeTypes.includes(mediaType))) {
    return {
      error: `The image at ${url} was served as "${mediaType ?? 'an unknown type'}", which ${label} cannot read.${supportedMimeTypes ? ` Supported types: ${supportedMimeTypes.join(', ')}.` : ''}`,
    }
  }

  const bytes = Buffer.from(await response.arrayBuffer())

  if (bytes.byteLength === 0) {
    return { error: `The image at ${url} was empty.` }
  }

  if (bytes.byteLength > maxImageBytes) {
    return {
      error: `The image at ${url} is ${Math.round(bytes.byteLength / 1024 / 1024)} MB, above ${label}'s ${Math.round(maxImageBytes / 1024 / 1024)} MB limit. Point getImageThumbnail at a smaller image size.`,
    }
  }

  const base64 = bytes.toString('base64')

  return { image: { base64, dataUri: `data:${mediaType};base64,${base64}`, mediaType } }
}

/**
 * Reads the model's response.
 *
 * Deliberately strict about a blank `altText`: the field is required on the
 * collection, so an empty string would satisfy that requirement while telling a
 * screen reader nothing — and nobody looks at an alt text again once it is set.
 */
function parseResults(content: unknown, locales: string[]): null | Record<string, AltTextResult> {
  const parsed = schemaForLocales(locales).safeParse(content)

  if (!parsed.success) {
    return null
  }

  const results: Record<string, AltTextResult> = {}

  for (const locale of locales) {
    const entry = parsed.data[locale]

    if (entry.altText.trim().length === 0) {
      return null
    }

    results[locale] = { altText: entry.altText.trim(), keywords: entry.keywords }
  }

  return results
}

/**
 * Creates a resolver for a vision (LLM) provider, leaving only the provider call
 * to `generate`: the prompt, the required response schema, the optional image
 * download and the strict reading of the response are handled here.
 *
 * All locales go into a single call rather than one call each: the image is
 * uploaded and analyzed once — the expensive part — and every language ends up
 * describing the same reading of it. `resolve` is that same call with one
 * locale.
 */
export const createVisionResolver = ({
  apiKey,
  generate,
  inlineImage = false,
  instructions = ({ defaultInstructions }) => defaultInstructions,
  key,
  label,
  maxImageBytes = 20 * 1024 * 1024,
  maxTokensPerLocale = 300,
  supportedMimeTypes,
  timeoutMs,
}: VisionResolverConfig): AltTextResolver => {
  const run = async ({
    filename,
    imageThumbnailMimeType,
    imageThumbnailUrl,
    locales,
    req,
  }: {
    filename?: string
    imageThumbnailMimeType?: string
    imageThumbnailUrl: string
    locales: string[]
    req: PayloadRequest
  }): Promise<
    { error: string; success: false } | { results: Record<string, AltTextResult>; success: true }
  > => {
    if (!apiKey) {
      return { error: `No ${label} API key configured`, success: false }
    }

    if (locales.length === 0) {
      return { error: 'No locale requested', success: false }
    }

    const signal = timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs)

    let image: undefined | VisionImage

    if (inlineImage) {
      const downloaded = await fetchImage({
        declaredMediaType: imageThumbnailMimeType,
        label,
        maxImageBytes,
        signal,
        supportedMimeTypes,
        url: imageThumbnailUrl,
      })

      if ('error' in downloaded) {
        return { error: downloaded.error, success: false }
      }

      image = downloaded.image
    }

    try {
      const defaultInstructions = buildDefaultInstructions({ locales })

      const content = await generate({
        filename,
        image,
        imageThumbnailMimeType,
        imageThumbnailUrl,
        instructions: await instructions({ defaultInstructions, filename, locales }),
        locales,
        maxTokens: maxTokensPerLocale * locales.length,
        req,
        responseSchema: z.toJSONSchema(schemaForLocales(locales), { target: 'draft-7' }),
        signal,
      })

      const results = parseResults(content, locales)

      if (!results) {
        return {
          error: `${label} did not return a usable alt text for every requested locale (${locales.join(', ')})`,
          success: false,
        }
      }

      return { results, success: true }
    } catch (error) {
      req.payload.logger.error({
        key,
        message: 'An error occurred when trying to generate the alt text',
        originalErr: error instanceof Error ? error.message : String(error),
      })

      return { error: error instanceof Error ? error.message : 'Unknown error', success: false }
    }
  }

  return {
    key,
    resolve: async ({
      filename,
      imageThumbnailMimeType,
      imageThumbnailUrl,
      locale,
      req,
    }: AltTextResolverArgs): Promise<AltTextResolverResponse> => {
      const result = await run({
        filename,
        imageThumbnailMimeType,
        imageThumbnailUrl,
        locales: [locale],
        req,
      })

      if (!result.success) {
        return { error: result.error, success: false }
      }

      return { result: result.results[locale], success: true }
    },
    resolveBulk: async ({
      filename,
      imageThumbnailMimeType,
      imageThumbnailUrl,
      locales,
      req,
    }: AltTextBulkResolverArgs): Promise<AltTextBulkResolverResponse> => {
      const result = await run({
        filename,
        imageThumbnailMimeType,
        imageThumbnailUrl,
        locales,
        req,
      })

      if (!result.success) {
        return { error: result.error, success: false }
      }

      return { results: result.results, success: true }
    },
    supportedMimeTypes,
  }
}
