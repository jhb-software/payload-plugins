import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { ChatCompletionContentPartText } from 'openai/resources/chat/completions.mjs'
import pMap from 'p-map'
import type { BasePayload, CollectionSlug, PayloadHandler, PayloadRequest } from 'payload'
import { z } from 'zod'

import { getGenerationCost } from '../utilities/getGenerationCost'
import type { AltTextPluginConfig } from '../types/AltTextPluginConfig'

/**
 * Generates and updates alt text for multiple images in all locales.
 */
export const bulkUpdateAltTextsEndpoint: PayloadHandler = async (req: PayloadRequest) => {
  try {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = 'json' in req && typeof req.json === 'function' ? await req.json() : null

    const schema = z.object({
      collection: z.string(),
      ids: z.array(z.string()),
    })

    const { collection, ids } = schema.parse(data)

    let updatedDocs = 0
    const erroredDocs: string[] = []

    // Get plugin config from payload config
    const pluginConfig = req.payload.config.custom?.aiAltTextPluginConfig as
      | AltTextPluginConfig
      | undefined

    if (!pluginConfig?.openAIApiKey) {
      return Response.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // Use concurrency from config
    const concurrency = pluginConfig.maxConcurrency || 16

    await pMap(
      ids,
      async (id) => {
        try {
          await generateAndUpdateAltText({
            payload: req.payload,
            id,
            collection,
            pluginConfig,
            locales: pluginConfig.locales,
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
      updatedDocs,
      totalDocs: ids.length,
      erroredDocs,
    })
  } catch (error) {
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
  payload,
  id,
  collection,
  pluginConfig,
  locales,
}: {
  payload: BasePayload
  id: string
  collection: CollectionSlug
  pluginConfig: AltTextPluginConfig
  locales: string[]
}) {
  const imageDoc = await payload.findByID({
    collection: collection,
    id: id as string,
    depth: 0,
  })

  if (!imageDoc) {
    throw new Error('Image not found')
  }

  const imageThumbnailUrl = pluginConfig.getImageThumbnail(imageDoc)

  const openai = new OpenAI({
    apiKey: pluginConfig.openAIApiKey,
  })

  const modelResponseSchema = z.object(
    locales.map((locale) => ({
      [locale]: z.object({
        altText: z.string().describe('A concise, descriptive alt text for the image'),
        keywords: z.array(z.string()).describe('Keywords that describe the content of the image'),
      }),
    })),
  )

  const response = await openai.chat.completions.parse({
    model: pluginConfig.model,
    messages: [
      {
        role: 'system',
        content: `
      You are an expert at analyzing images and creating descriptive image alt text. 
      
      Please analyze the given image and provide the following in ${locales.join(', ')}:
      - A concise, localized descriptive alt text (1-2 sentences) as "altText". Focus on the subject, action, and setting. Avoid phrases like 'Image of', 'A picture of', or 'Photo showing'. Be specific and include relevant details like location or context if visible. Make no assumptions.
      - A localized list of keywords that describe the content (e.g., ["Camel", "Palm trees", "Desert"]) as "keywords"
    
      If a context is provided, use it to enhance the alt text.
      
      Format your response as a JSON object with ${locales.join(', ')} keys, each containing "altText", "keywords" and "slug".
    `,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageThumbnailUrl },
          },
          ...('filename' in imageDoc && imageDoc.filename
            ? [
                {
                  type: 'text',
                  text: imageDoc.filename,
                } satisfies ChatCompletionContentPartText,
              ]
            : []),
        ],
      },
    ],
    max_completion_tokens: 300,
    response_format: zodResponseFormat(modelResponseSchema, 'data'),
  })

  console.log({ imageId: id, ...getGenerationCost(response, pluginConfig.model) })

  const result = response.choices[0]?.message?.parsed

  if (!result) {
    throw new Error('No result from OpenAI')
  }

  for (const locale of locales) {
    await payload.update({
      collection: collection as CollectionSlug,
      id: id as string,
      locale: locale,
      data: {
        alt: (result as any)[locale]?.altText,
        keywords: (result as any)[locale]?.keywords,
      },
    })
  }
}
