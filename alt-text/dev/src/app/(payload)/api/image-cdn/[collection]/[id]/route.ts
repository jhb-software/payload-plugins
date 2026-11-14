import config from '@payload-config'
import { getPayload } from 'payload'
import sharp from 'sharp'

/**
 * Stands in for the image CDN a website puts in front of its uploads — the kind
 * that always emits WebP no matter what was uploaded (a Cloudinary `f_webp`
 * transformation, an imgix `fm=webp`, and so on).
 *
 * The plugin config points `getImageThumbnail` at this route and declares
 * `imageThumbnailMimeType: 'image/webp'`, which is truthful here: the resolver
 * only ever receives the bytes served by this route, and they are always WebP.
 * Upload an AVIF or HEIC image and alt text generation still works, even though
 * the OpenAI resolver does not accept those source formats.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ collection: string; id: string }> },
) {
  const { collection, id } = await params
  const payload = await getPayload({ config })

  const doc = await payload.findByID({
    collection: collection as 'media',
    id,
    depth: 0,
    overrideAccess: true,
  })

  const originUrl = (doc as { url?: string }).url
  if (!originUrl) {
    return new Response(`Document ${collection}/${id} has no url`, { status: 404 })
  }

  const origin = await fetch(originUrl)
  if (!origin.ok) {
    return new Response(`Could not fetch origin image: ${origin.status}`, { status: 502 })
  }

  const webp = await sharp(Buffer.from(await origin.arrayBuffer()))
    .resize(600, null, { withoutEnlargement: true })
    .webp()
    .toBuffer()

  return new Response(new Uint8Array(webp), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'no-store',
    },
  })
}
