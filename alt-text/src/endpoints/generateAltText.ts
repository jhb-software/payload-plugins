import type { PayloadHandler, PayloadRequest } from 'payload'

import { z } from 'zod'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

/**
 * Generates alt text for a single image using the configured resolver.
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

    if (!pluginConfig.resolver) {
      return Response.json({ error: 'No alt text resolver configured' }, { status: 500 })
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

    const result = await pluginConfig.resolver.resolve({
      filename: 'filename' in imageDoc ? (imageDoc.filename as string) : undefined,
      imageUrl: imageThumbnailUrl,
      locale: targetLocale,
      req,
    })

    if (!result.success) {
      return Response.json(
        { error: result.error || 'Failed to generate alt text' },
        { status: 500 },
      )
    }

    return Response.json(result.result)
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
