import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'

import type { DocPaths } from '../utils/computeDocPaths.js'
import type { DescendantPaths } from '../utils/loadDescendants.js'

import { computeDocPaths, noDocPaths } from '../utils/computeDocPaths.js'
import { assembleDescendantPaths, loadDescendants } from '../utils/loadDescendants.js'
import { pagesPluginConfigOf } from '../utils/pageCollectionConfigHelpers.js'
import { SKIP_PARENT_GUARD_CONTEXT_KEY } from './preventParentDeletion.js'

/**
 * Context key under which the pre-write state of every changed or deleted page document is
 * stashed, keyed `collection:id` so bulk writes and bulk deletes work.
 *
 * The capture exists because `previousDoc` cannot supply the previous live path: on a
 * drafts-enabled collection Payload fetches it as the *latest* version — after a
 * rename-in-draft-then-publish it already carries the new slug — and on a delete the virtual
 * `path` does not survive at all. `pathChanges` reads the capture back in `afterChange` /
 * `afterDelete`.
 */
export const PATH_CAPTURE_KEY = 'pagesPluginPathCapture'

export type PathCapture = {
  /** Pre-delete paths of the descendants a hard delete may orphan (guard disabled or skipped). */
  descendants?: DescendantPaths[]
  /** A capture failure, rethrown by `pathChanges` so a purge is never silently incomplete. */
  error?: unknown
} & DocPaths

export function pathCaptures(context: Record<string, unknown>): Record<string, PathCapture> {
  return ((context[PATH_CAPTURE_KEY] as Record<string, PathCapture>) ??= {})
}

/**
 * Whether a write only stores a version row and cannot change a live path: a draft save or
 * autosave tick that does not publish (`_status: 'published'` publishes regardless of the
 * draft flag). The capture skips such writes in `beforeChange` judging the incoming `data`,
 * `pathChanges` skips them in `afterChange` judging the resulting `doc` — the two sources
 * agree because Payload materializes `_status: 'draft'` on a draft save that omits it.
 *
 * The draft intent comes off `req.context` because `beforeChange` receives no `draft` either
 * (https://github.com/payloadcms/payload/issues/16180).
 *
 * With a localized `_status` the value is an object, and any published locale disqualifies the
 * write. That is a conservative proxy, not an exact answer: a draft save in `de` on a document
 * whose `en` is published also touches only a version row, yet counts as a full write here. The
 * cost is one extra `computeDocPaths` whose diff comes out empty; the check never skips a write
 * that can move a live path.
 */
export function isVersionOnlyWrite(context: Record<string, unknown>, status: unknown): boolean {
  return context.draft === true && !publishesAnyLocale(status)
}

function publishesAnyLocale(status: unknown): boolean {
  if (status && typeof status === 'object') {
    return Object.values(status).includes('published')
  }
  return status === 'published'
}

/**
 * Records the paths a page document resolves before an update is written.
 *
 * Returns immediately for a draft save or autosave tick (unless it carries
 * `_status: 'published'`, which publishes regardless of the draft flag): such a write only
 * creates a version row and cannot change a live path, so it costs no extra read. The read
 * lands only on writes that can move a live URL: publish, unpublish, trash, restore.
 */
export const capturePreviousPathsBeforeChange: CollectionBeforeChangeHook = async ({
  collection,
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update') {
    return data
  }
  if (isVersionOnlyWrite(req.context, data?._status)) {
    return data
  }

  const id = originalDoc?.id
  if (id == null) {
    return data
  }

  const captures = pathCaptures(req.context)
  const key = `${collection.slug}:${String(id)}`

  try {
    captures[key] =
      (await computeDocPaths({ id, collectionConfig: collection, req })) ?? noDocPaths()
  } catch (error) {
    captures[key] = { ...noDocPaths(), error }
  }

  return data
}

/**
 * Records the paths a page document resolves before it is hard-deleted — the virtual `path` is
 * absent from the document `afterDelete` receives, so this capture is the only source.
 *
 * When the parent guard cannot have run (`preventParentDeletion: false`, or the caller skipped
 * it via `SKIP_PARENT_GUARD_CONTEXT_KEY`), the delete may orphan descendants whose URLs break
 * without any hook firing for them, so their paths are captured too. With the guard active a
 * deletable document has no children, and no subtree query is issued.
 */
export const capturePreviousPathsBeforeDelete: CollectionBeforeDeleteHook = async ({
  id,
  collection,
  req,
}) => {
  const captures = pathCaptures(req.context)
  const key = `${collection.slug}:${String(id)}`

  try {
    const capture: PathCapture =
      (await computeDocPaths({ id, collectionConfig: collection, req })) ?? noDocPaths()

    const pluginConfig = pagesPluginConfigOf(collection)
    const guardInactive =
      pluginConfig?.preventParentDeletion === false ||
      req.context[SKIP_PARENT_GUARD_CONTEXT_KEY] === true

    if (guardInactive) {
      const root = { id, collection: collection.slug }
      const rows = await loadDescendants({ req, root })
      capture.descendants = assembleDescendantPaths(capture.paths, root, rows)
    }

    captures[key] = capture
  } catch (error) {
    captures[key] = { ...noDocPaths(), error }
  }
}
