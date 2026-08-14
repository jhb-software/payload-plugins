import { getPayload } from 'payload'
import config from '@payload-config'
import {
  clearCapturedAfterChanges,
  getLastAfterChangeHookArgs,
} from '../../../test/afterChangeCapture'

/**
 * Demonstrates that a create/update passing a narrow `select` still computes the virtual fields.
 *
 * Start the dev app with `pnpm dev` and open http://localhost:3000/demo/narrow-select
 *
 * The plugin's `setVirtualFieldsAfterChange` hook builds `path` and `breadcrumbs` from `slug`,
 * the parent field and the breadcrumb label field. Payload applies `select` *before* the
 * `afterChange` hooks run, so unless the plugin widens the select behind the scenes those inputs
 * are missing and every downstream `afterChange` hook sees an undefined `path`.
 *
 * The response of this route shows both halves of the behaviour:
 *  - `updateResponse` contains `title` and nothing else — the fields the plugin selected on its
 *    own behalf are stripped again, which is what separates this from a `forceSelect`
 *  - `receivedByAfterChangeHook` carries the correct `path` and `breadcrumbs` all the same
 */
export const GET = async () => {
  const payload = await getPayload({ config })

  const emptyVirtualFields = {
    breadcrumbs: [],
    meta: { alternatePaths: [] },
    path: '',
  }

  const rootPage = await payload.create({
    collection: 'pages',
    locale: 'de',
    data: {
      title: 'Narrow Select Demo Root',
      slug: '',
      content: 'Root content',
      isRootPage: true,
      ...emptyVirtualFields,
    },
  })

  const childPage = await payload.create({
    collection: 'pages',
    locale: 'de',
    data: {
      title: 'Narrow Select Demo Child',
      slug: 'narrow-select-demo-child',
      content: 'Child content',
      parent: rootPage.id,
      ...emptyVirtualFields,
    },
  })

  clearCapturedAfterChanges()

  const updateResponse = await payload.update({
    collection: 'pages',
    id: childPage.id,
    locale: 'de',
    data: { title: 'Narrow Select Demo Child (updated)' },
    select: { title: true },
  })

  const { doc } = getLastAfterChangeHookArgs()

  // Clean up so the route can be opened repeatedly.
  await payload.delete({ collection: 'pages', id: childPage.id })
  await payload.delete({ collection: 'pages', id: rootPage.id })

  return Response.json({
    select: { title: true },
    updateResponse,
    updateResponseKeys: Object.keys(updateResponse).sort(),
    receivedByAfterChangeHook: {
      breadcrumbs: doc.breadcrumbs,
      path: doc.path,
    },
  })
}
