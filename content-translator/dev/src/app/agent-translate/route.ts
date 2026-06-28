import configPromise from '@payload-config'
import { getPayload } from 'payload'

/**
 * Exercises the agent/programmatic translate-and-save flow end-to-end by calling
 * the real REST endpoint `POST /api/translator/translate` with `update: true`,
 * rather than the operation directly — so the endpoint's flag parsing, auth gate
 * and write path are all covered.
 *
 * The dev app auto-logs-in, so a browser visiting this route already has a
 * Payload session cookie, which is forwarded to the endpoint as the agent's auth.
 *
 * Visit:
 *   /agent-translate              → translate the "home" page en → de and publish it
 *   /agent-translate?draft=true   → save the translation as a draft instead
 *   /agent-translate?slug=about   → pick a different seeded page
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

  // Call the actual endpoint, forwarding the browser's session cookie as auth.
  const endpointResponse = await fetch(`${url.origin}/api/translator/translate`, {
    body: JSON.stringify({
      collectionSlug: 'pages',
      draft,
      id: page.id,
      locale: 'de',
      localeFrom: 'en',
      update: true,
    }),
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    method: 'POST',
  })

  if (!endpointResponse.ok) {
    return Response.json(
      { endpointStatus: endpointResponse.status, error: await endpointResponse.text() },
      { status: endpointResponse.status },
    )
  }

  // Read back the persisted German title to prove the endpoint wrote it.
  const persisted = await payload.findByID({
    id: page.id,
    collection: 'pages',
    draft: true,
    locale: 'de',
  })

  return Response.json({
    draft,
    persistedGermanTitle: persisted.title,
    slug,
  })
}
