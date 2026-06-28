import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { translateOperation } from '@jhb.software/payload-content-translator-plugin'

/**
 * Demonstrates the agent/programmatic translate-and-save flow that the REST
 * endpoint `POST /api/translator/translate` exposes via the `update` flag.
 *
 * Visit:
 *   /agent-translate                  → translate the "home" page en → de and publish it
 *   /agent-translate?draft=true       → save the translation as a draft instead
 *   /agent-translate?slug=about       → pick a different seeded page
 *
 * Returns the German title before and after so the persisted result is visible
 * without opening the admin panel.
 */
export const GET = async (request: Request) => {
  const payload = await getPayload({ config: configPromise })

  const url = new URL(request.url)
  const slug = url.searchParams.get('slug') ?? 'home'
  const draft = url.searchParams.get('draft') === 'true'

  const { docs } = await payload.find({
    collection: 'pages',
    depth: 0,
    limit: 1,
    where: { slug: { equals: slug } },
  })

  const page = docs[0]

  if (!page) {
    return Response.json({ error: `No page found with slug "${slug}"` }, { status: 404 })
  }

  const before = await payload.findByID({
    id: page.id,
    collection: 'pages',
    draft: true,
    locale: 'de',
  })

  await translateOperation({
    id: page.id,
    collectionSlug: 'pages',
    draft,
    locale: 'de',
    localeFrom: 'en',
    payload,
    update: true,
  })

  const after = await payload.findByID({
    id: page.id,
    collection: 'pages',
    draft: true,
    locale: 'de',
  })

  return Response.json({
    draft,
    slug,
    titleAfter: after.title,
    titleBefore: before.title,
  })
}
