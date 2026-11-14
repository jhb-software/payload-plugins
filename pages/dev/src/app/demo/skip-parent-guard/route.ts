import { SKIP_PARENT_GUARD_CONTEXT_KEY } from '@jhb.software/payload-pages-plugin'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Demonstrates the parent guard opt-out on a whole-subtree teardown.
 *
 * Start the dev app with `pnpm dev` and open http://localhost:3000/demo/skip-parent-guard
 *
 * Deleting a parent which is still referenced by a child is refused, so a teardown either has to
 * order its deletes leaf-first or opt out. Passing `SKIP_PARENT_GUARD_CONTEXT_KEY` through the
 * `context` argument disables the guard for that request only — nothing can be orphaned, because
 * every child of the subtree is deleted in the same teardown.
 *
 * The response shows both halves: `refusedWithoutOptOut` carries the guard's error message, and
 * `remainingPagesAfterTeardown` is 0 once the parent-first deletes ran with the opt-out.
 */
export const GET = async () => {
  const payload = await getPayload({ config })

  const emptyVirtualFields = {
    breadcrumbs: [],
    meta: { alternatePaths: [] },
    path: '',
  }

  const parentPage = await payload.create({
    collection: 'pages',
    locale: 'de',
    data: {
      title: 'Skip Parent Guard Demo Parent',
      slug: 'skip-parent-guard-demo-parent',
      content: 'Parent content',
      ...emptyVirtualFields,
    },
  })

  const childPage = await payload.create({
    collection: 'pages',
    locale: 'de',
    data: {
      title: 'Skip Parent Guard Demo Child',
      slug: 'skip-parent-guard-demo-child',
      content: 'Child content',
      parent: parentPage.id,
      ...emptyVirtualFields,
    },
  })

  let refusedWithoutOptOut: null | string = null
  try {
    await payload.delete({ collection: 'pages', id: parentPage.id })
  } catch (error) {
    refusedWithoutOptOut = (error as Error).message
  }

  const skipGuard = { [SKIP_PARENT_GUARD_CONTEXT_KEY]: true }

  await payload.delete({ collection: 'pages', id: parentPage.id, context: skipGuard })
  await payload.delete({ collection: 'pages', id: childPage.id, context: skipGuard })

  const remaining = await payload.find({
    collection: 'pages',
    limit: 0,
    where: { slug: { like: 'skip-parent-guard-demo' } },
  })

  return Response.json({
    refusedWithoutOptOut,
    contextPassedToTeardown: skipGuard,
    remainingPagesAfterTeardown: remaining.totalDocs,
  })
}
