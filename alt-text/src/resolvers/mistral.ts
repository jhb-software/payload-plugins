import { z } from 'zod'

import type {
  AltTextBulkResolverArgs,
  AltTextBulkResolverResponse,
  AltTextResolver,
  AltTextResolverArgs,
  AltTextResolverResponse,
  AltTextResult,
} from './types.js'

export type MistralResolverConfig = {
  /** Mistral API key for authentication */
  apiKey: string
  /**
   * Base URL of the Mistral API.
   * @default 'https://api.mistral.ai/v1'
   */
  baseUrl?: string
  /**
   * The vision-capable Mistral model to use for alt text generation.
   *
   * Must be able to read images — `mistral-medium-latest`,
   * `mistral-large-latest`, `mistral-small-latest` and the `ministral-*` models
   * all are.
   *
   * @default 'mistral-medium-latest'
   */
  model?: string
  /**
   * Abort after this many milliseconds. Covers downloading the image and the
   * completion call together.
   * @default 30000
   */
  timeoutMs?: number
}

/**
 * Image formats the Mistral API accepts.
 *
 * Narrower than what an upload collection may hold — SVG and AVIF are missing,
 * so the endpoint rejects those documents and their generate button stays
 * disabled instead of failing at the provider.
 */
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** Mistral rejects images above 20 MB. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const altTextSchema = z.object({
  altText: z.string().describe('A concise, descriptive alt text for the image'),
  keywords: z.array(z.string()).describe('Keywords that describe the content of the image'),
})

/** One schema entry per requested locale, so the model must answer for all of them. */
const schemaForLocales = (locales: string[]) =>
  z.object(Object.fromEntries(locales.map((locale) => [locale, altTextSchema])))

/**
 * Downloads the image and returns it as a data URI.
 *
 * Mistral can fetch an image URL itself, but that path is not dependable for a
 * CMS. It requires the file to be reachable from the public internet — never
 * true in local development, and not true for private buckets — and some hosts
 * refuse Mistral's fetcher outright, which surfaces as `File could not be
 * fetched from url` (error 3310). Sending the bytes removes that whole class of
 * failure for the price of one extra download.
 */
async function fetchImageAsDataUri(
  url: string,
  signal: AbortSignal,
): Promise<{ dataUri: string } | { error: string }> {
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

  // The document's mime type is checked by the endpoint before the resolver
  // runs, but `getImageThumbnail` may point at a derivative in a different
  // format, so trust what was actually served.
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()

  if (!contentType || !SUPPORTED_MIME_TYPES.includes(contentType)) {
    return {
      error: `The image at ${url} was served as "${contentType ?? 'an unknown type'}", which Mistral cannot read. Supported types: ${SUPPORTED_MIME_TYPES.join(', ')}.`,
    }
  }

  const bytes = Buffer.from(await response.arrayBuffer())

  if (bytes.byteLength === 0) {
    return { error: `The image at ${url} was empty.` }
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return {
      error: `The image at ${url} is ${Math.round(bytes.byteLength / 1024 / 1024)} MB, above Mistral's 20 MB limit. Point getImageThumbnail at a smaller image size.`,
    }
  }

  return { dataUri: `data:${contentType};base64,${bytes.toString('base64')}` }
}

function buildPrompt(locales: string[]): string {
  const languages = locales.join(', ')

  return `
      You are an expert at analyzing images and creating descriptive image alt text.

      Please analyze the given image and provide the following in ${languages}:
      - A concise, descriptive alt text (1-2 sentences) as "altText". Focus on the subject, action, and setting. Avoid phrases like 'Image of', 'A picture of', or 'Photo showing'. Be specific and include relevant details like location or context if visible. Make no assumptions.
      - A list of keywords that describe the content (e.g., ["Camel", "Palm trees", "Desert"]) as "keywords"

      If a context is provided, use it to enhance the alt text.

      Format your response as a JSON object with ${locales.map((locale) => `"${locale}"`).join(', ')} keys, each containing "altText" and "keywords".
    `
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
 * One request, one or more locales.
 *
 * All locales go into a single call rather than one call each: the image is
 * uploaded and analyzed once — the expensive part — and every language ends up
 * describing the same reading of it.
 */
async function generate({
  apiKey,
  baseUrl,
  filename,
  imageThumbnailUrl,
  locales,
  model,
  timeoutMs,
}: {
  apiKey: string
  baseUrl: string
  filename?: string
  imageThumbnailUrl: string
  locales: string[]
  model: string
  timeoutMs: number
}): Promise<
  { error: string; success: false } | { results: Record<string, AltTextResult>; success: true }
> {
  if (!apiKey) {
    return { error: 'No Mistral API key configured', success: false }
  }

  if (locales.length === 0) {
    return { error: 'No locale requested', success: false }
  }

  const signal = AbortSignal.timeout(timeoutMs)
  const image = await fetchImageAsDataUri(imageThumbnailUrl, signal)

  if ('error' in image) {
    return { error: image.error, success: false }
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: 150 * locales.length,
        messages: [
          { content: buildPrompt(locales), role: 'system' },
          {
            content: [
              { type: 'image_url', image_url: image.dataUri },
              ...(filename ? [{ type: 'text', text: filename }] : []),
            ],
            role: 'user',
          },
        ],
        model,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'data',
            schema: z.toJSONSchema(schemaForLocales(locales), { target: 'draft-7' }),
            strict: true,
          },
        },
      }),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      method: 'POST',
      signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')

      return {
        error: `Mistral responded with status ${response.status}${body ? `: ${body}` : ''}`,
        success: false,
      }
    }

    const completion = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[]
    }
    const content = completion.choices?.[0]?.message?.content

    if (typeof content !== 'string') {
      return { error: 'No result from Mistral', success: false }
    }

    const results = parseResults(JSON.parse(content), locales)

    if (!results) {
      return {
        error: `Mistral did not return a usable alt text for every requested locale (${locales.join(', ')})`,
        success: false,
      }
    }

    return { results, success: true }
  } catch (error) {
    console.error('Error generating alt text:', error)

    return { error: error instanceof Error ? error.message : 'Unknown error', success: false }
  }
}

/**
 * Creates a Mistral-based resolver for alt text generation.
 *
 * @example
 * ```typescript
 * import { mistralResolver } from '@jhb.software/payload-alt-text-plugin'
 *
 * mistralResolver({
 *   apiKey: process.env.MISTRAL_API_KEY,
 *   model: 'mistral-medium-latest', // optional, this is the default
 * })
 * ```
 */
export const mistralResolver = (config: MistralResolverConfig): AltTextResolver => {
  const {
    apiKey,
    baseUrl = 'https://api.mistral.ai/v1',
    model = 'mistral-medium-latest',
    timeoutMs = 30_000,
  } = config

  return {
    key: 'mistral',
    resolve: async ({
      filename,
      imageThumbnailUrl,
      locale,
    }: AltTextResolverArgs): Promise<AltTextResolverResponse> => {
      const result = await generate({
        apiKey,
        baseUrl,
        filename,
        imageThumbnailUrl,
        locales: [locale],
        model,
        timeoutMs,
      })

      if (!result.success) {
        return { error: result.error, success: false }
      }

      return { result: result.results[locale], success: true }
    },
    resolveBulk: async ({
      filename,
      imageThumbnailUrl,
      locales,
    }: AltTextBulkResolverArgs): Promise<AltTextBulkResolverResponse> => {
      const result = await generate({
        apiKey,
        baseUrl,
        filename,
        imageThumbnailUrl,
        locales,
        model,
        timeoutMs,
      })

      if (!result.success) {
        return { error: result.error, success: false }
      }

      return { results: result.results, success: true }
    },
    // https://docs.mistral.ai/capabilities/vision/
    supportedMimeTypes: SUPPORTED_MIME_TYPES,
  }
}
