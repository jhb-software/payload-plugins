import type { ChatCompletionContentPartText } from 'openai/resources/chat/completions.mjs'
import type { PayloadHandler, PayloadRequest } from 'payload'

import OpenAI from 'openai'
import { z } from 'zod'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

import { getGenerationCost } from '../utilities/getGenerationCost.js'
import { zodResponseFormat } from '../utilities/zodResponseFormat.js'

/**
 * Generates alt text for a single image using OpenAI Vision API.
 * Returns result without updating the document.
 */
export const generateAltTextEndpoint: PayloadHandler = async (req: PayloadRequest) => {
  try {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = 'json' in req && typeof req.json === 'function' ? await req.json() : null

    const requestSchema = z.object({
      id: z.string(),
      collection: z.string(),
      locale: z.string().nullable(),
    })

    const { id, collection, locale } = requestSchema.parse(data)

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
      return Response.json({ error: 'getImageThumbnail function not configured' }, { status: 500 })
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

    if (!imageThumbnailUrl) {
      return Response.json({ error: 'Image thumbnail URL not defined' }, { status: 500 })
    }

    if (!imageThumbnailUrl.startsWith('https://') && !imageThumbnailUrl.includes('http://')) {
      return Response.json(
        { error: 'Image thumbnail URL is not a valid URL. It must start with https:// or http://' },
        { status: 500 },
      )
    }

    const openai = new OpenAI({
      apiKey: pluginConfig.openAIApiKey,
    })

    const modelResponseSchema = z.object({
      altText: z.string().describe('A concise, descriptive alt text for the image'),
      keywords: z.array(z.string()).describe('Keywords that describe the content of the image'),
    })

    const response = await openai.chat.completions.parse({
      messages: [
        {
          content: `
            You are an expert at analyzing images and creating descriptive image alt text. 
            
            Please analyze the given image and provide the following:
            - A concise, descriptive alt text (1-2 sentences) as "altText". Focus on the subject, action, and setting. Avoid phrases like 'Image of', 'A picture of', or 'Photo showing'. Be specific and include relevant details like location or context if visible. Make no assumptions.
            - A list of keywords that describe the content (e.g., ["Camel", "Palm trees", "Desert"]) as "keywords"

            If a context is provided, use it to enhance the alt text.

            Format your response as a JSON object. You must respond in the ${targetLocale} language.
          `,
          role: 'system',
        },
        {
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
          role: 'user',
        },
      ],
      model: pluginConfig.model,
      // limit the response tokens and costs per request
      max_completion_tokens: 150,
      response_format: zodResponseFormat(modelResponseSchema, 'data'),
    })

    console.log({ imageId: id, ...getGenerationCost(response, pluginConfig.model) })

    const result = response.choices[0]?.message?.parsed

    if (!result) {
      return Response.json({ error: 'No result from OpenAI' }, { status: 500 })
    }

    return Response.json(result)
  } catch (error) {
    console.error('Error generating alt text:', error)
    return Response.json(
      {
        error: `Error generating alt text: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 },
    )
  }
}
