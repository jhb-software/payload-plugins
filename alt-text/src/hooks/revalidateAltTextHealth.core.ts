import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

export type RevalidateAltTextHealthDeps = {
  /**
   * `after` from `next/server`. Schedules a callback to run after the response
   * is sent, so it escapes the render scope of a server component. Throws when
   * called outside any Next.js request scope (e.g. CLI scripts, migrations).
   */
  after: (callback: () => void) => void
  /**
   * `revalidateTag` from `next/cache`. Marks the cache tag as stale.
   */
  revalidateTag: (tag: string) => void
}

const PLUGIN_LOG_SLUG = 'alt-text'

export function safeRevalidateAltTextHealthTag(
  req: PayloadRequest,
  tag: string,
  deps: RevalidateAltTextHealthDeps,
): void {
  const runRevalidate = (): void => {
    try {
      deps.revalidateTag(tag)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (message.includes('static generation store missing')) {
        req.payload.logger.warn({
          msg: 'Skipping alt text health cache revalidation outside a Next.js request context.',
          plugin: PLUGIN_LOG_SLUG,
          tag,
        })
        return
      }

      throw error
    }
  }

  try {
    // Defer via `after()` so the call escapes the current render scope.
    // Next.js disallows synchronous `revalidateTag` from inside a server-component
    // render — relevant when users seed via `payload.create` from `onInit`,
    // which runs while the admin route is rendering.
    deps.after(runRevalidate)
  } catch {
    // No request scope (CLI / migrations / scripts). Run inline; the inner
    // `try/catch` will warn-and-skip if Next.js itself has no context either.
    runRevalidate()
  }
}

export const createRevalidateAltTextHealthAfterChangeHookWithDeps =
  (tag: string, deps: RevalidateAltTextHealthDeps): CollectionAfterChangeHook =>
  ({ doc, req }) => {
    if (!req.context?.disableRevalidate) {
      safeRevalidateAltTextHealthTag(req, tag, deps)
    }

    return doc
  }

export const createRevalidateAltTextHealthAfterDeleteHookWithDeps =
  (tag: string, deps: RevalidateAltTextHealthDeps): CollectionAfterDeleteHook =>
  ({ doc, req }) => {
    if (!req.context?.disableRevalidate) {
      safeRevalidateAltTextHealthTag(req, tag, deps)
    }

    return doc
  }
