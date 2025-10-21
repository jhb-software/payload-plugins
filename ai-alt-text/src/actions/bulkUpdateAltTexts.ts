'use server'

import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import {
  ChatCompletionContentPartText,
  ChatCompletionContentPartImage,
} from 'openai/resources/chat/completions.mjs'
import pMap from 'p-map'
import type { BasePayload, CollectionSlug } from 'payload'
import { getPayload } from 'payload'
import { z } from 'zod'

import { getGenerationCost } from '../utilities/getGenerationCost'
import { getImageDataUrl } from '../utilities/getImageDataUrl'
import { getImageThumbnail } from '../utilities/getImageThumbnail'
import { getUserFromHeaders } from '../utilities/getUserFromHeaders'
import type { MediaDocument } from '../types/MediaDocument'
import type { IncomingAltTextPluginConfig } from '../types/AltTextPluginConfig'

/**
 * Generates and updates alt text for multiple images in all locales.
 */
export async function bulkUpdateAltTexts({
  collection,
  ids,
  model = 'gpt-4o-mini',
}: {
  collection: CollectionSlug
  ids: string[]
  model?: 'gpt-4o-mini' | 'gpt-4o-2024-08-06'
}): Promise<{
  updatedDocs: number
  totalDocs: number
  erroredDocs: string[]
}> {
  try {
    // @ts-ignore - User's project will have @payload-config
    const payload = await getPayload({ config: await import('@payload-config') })
    const user = await getUserFromHeaders({ payload })

    if (!user) {
      throw new Error('Unauthorized')
    }

    let updatedDocs = 0
    const erroredDocs: string[] = []

    // Get plugin config from payload config (like pages plugin does)
    const pluginConfig = payload.config.custom?.aiAltTextPluginConfig as
      | (IncomingAltTextPluginConfig & { openAIApiKey: string })
      | undefined

    // Check for plugin config
    if (!pluginConfig?.openAIApiKey) {
      throw new Error('OpenAI API key not configured')
    }

    // Use concurrency from config
    const concurrency = pluginConfig.maxConcurrency || 16

    await pMap(
      ids,
      async (id) => {
        try {
          await generateAndUpdateAltText({ payload, id, collection, model })
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

    return {
      updatedDocs,
      totalDocs: ids.length,
      erroredDocs,
    }
  } catch (error) {
    console.error('Error in bulk generation:', error)
    throw new Error(
      `Error generating alt text: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

async function generateAndUpdateAltText({
  payload,
  id,
  collection,
  model,
}: {
  payload: BasePayload
  id: string
  collection: CollectionSlug
  model: string
}) {
  const imageDoc = await payload.findByID({
    collection,
    id,
    depth: 0,
  })

  if (!imageDoc) {
    throw new Error('Image not found')
  }

  const thumbnailUrl = getImageThumbnail(imageDoc as MediaDocument)

  // For local development (http://), convert image to base64
  const imageUrl = thumbnailUrl.startsWith('http://')
    ? await getImageDataUrl(thumbnailUrl)
    : thumbnailUrl

  // Get plugin config from payload config
  const pluginConfig = payload.config.custom?.aiAltTextPluginConfig as
    | (IncomingAltTextPluginConfig & { openAIApiKey: string })
    | undefined

  if (!pluginConfig?.openAIApiKey) {
    throw new Error('OpenAI API key not configured')
  }

  const openai = new OpenAI({
    apiKey: pluginConfig.openAIApiKey,
  })

  // Get locales from Payload config
  const locales = payload.config.localization
    ? (payload.config.localization.localeCodes as string[])
    : []

  // If no localization configured, skip bulk update (needs localized fields)
  if (locales.length === 0) {
    console.warn('No localization configured - bulk generation requires localized fields')
    return
  }

  // Build dynamic schema based on configured locales
  const localeSchemaObj: Record<string, z.ZodTypeAny> = {}
  locales.forEach((locale) => {
    localeSchemaObj[locale] = z.object({
      altText: z.string(),
      keywords: z.array(z.string()),
    })
  })
  const schema = z.object(localeSchemaObj)

  const response = await openai.chat.completions.parse({
    model,
    messages: [
      {
        role: 'system',
        content: `
          Expert at creating localized alt text for multiple languages.

          For each requested language, provide:
          - Concise alt text (1-2 sentences)
          - Keywords describing content

          Avoid 'Image of' phrases. Be specific. Make no assumptions.
        `,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          } satisfies ChatCompletionContentPartImage,
          ...('filename' in imageDoc && imageDoc.filename
            ? [{ type: 'text', text: imageDoc.filename } satisfies ChatCompletionContentPartText]
            : []),
          ...('context' in imageDoc && imageDoc.context
            ? [
                {
                  type: 'text',
                  text: String(imageDoc.context),
                } satisfies ChatCompletionContentPartText,
              ]
            : []),
        ],
      },
    ],
    max_completion_tokens: 300,
    response_format: zodResponseFormat(schema, 'data'),
  })

  console.log({ imageId: id, ...getGenerationCost(response, model) })

  const result = response.choices[0]?.message?.parsed

  if (!result) {
    throw new Error('No result from OpenAI')
  }

  // Update for each locale
  for (const locale of locales) {
    const localeResult = result?.[locale]
    if (
      localeResult &&
      typeof localeResult === 'object' &&
      'altText' in localeResult &&
      'keywords' in localeResult &&
      typeof localeResult.altText === 'string' &&
      Array.isArray(localeResult.keywords)
    ) {
      await payload.update({
        collection,
        id,
        // Type assertion needed as locale types vary by project
        ...(locale ? { locale: locale as Parameters<typeof payload.update>[0]['locale'] } : {}),
        data: {
          alt: localeResult.altText,
          keywords: localeResult.keywords,
        },
      } as Parameters<typeof payload.update>[0])
    }
  }
}
