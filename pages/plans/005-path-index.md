---
title: Path index — enumerate paths and observe path changes
description: The plugin exposes one third of a path index: resolve one path. Enumeration and change detection are reimplemented by every consumer that has a sitemap or a cache, incorrectly in the cases that matter most.
type: feature
readiness: ready
---

## Problem

`findPageByPath` (`queries/findPageByPath.ts`) answers one question: which document does this path resolve to? The plugin owns two more answers and publishes neither.

### Which paths exist

Only the plugin knows which collections are page collections — it stashes `custom.pageConfig` on each during config transformation (`collections/PageCollectionConfig.ts:91-96`), after the consumer's config is built. Anything that needs "every live path" must therefore re-derive the list and re-apply the liveness rules by hand:

```ts
for (const collection of pageCollectionSlugs) {
  const { docs } = await payload.find({
    collection,
    limit: 0,
    depth: 0,
    where: { and: [{ _status: { equals: 'published' } } /* app rules */] },
    select: { path: true, updatedAt: true },
  })
  // …collect
}
```

That loop is written once for a sitemap, again for cache re-warming, again for an llms.txt — and edited every time a page collection is added. The collection list itself is commonly recomputed by filtering the raw config for collections that carry a `page` key, which is the plugin's own predicate reimplemented in consumer code.

### When a path changes

`setVirtualFieldsAfterChange` (`hooks/setVirtualFields.ts:89`) computes the path and already determines whether the fields it depends on changed (`:140-143`). At that moment the plugin knows precisely what happened to the path. It emits nothing, so a consumer that needs to invalidate a cache or ping a revalidation endpoint reconstructs it from `doc` and `previousDoc`. Reconstruction fails in four distinct ways, each of which is plugin knowledge leaking:

**The path may not be there.** A caller's narrow `select`, a failed ancestor walk, or an unset slug all yield a document without `path` (`hooks/setVirtualFields.ts:53-56,72-78,123-133`). Consumers write defensive guards — throwing, or logging and skipping — against the plugin's own contract. Plan 002 removes the largest cause; it cannot remove all of them.

**A delete carries no path.** `path` is virtual, so it is absent from the document passed to `afterDelete`. The workaround is a `beforeDelete` hook that re-reads the document, stashes its path on `req.context`, and a matching `afterDelete` that reads the stash back — a three-part mechanism that exists purely because a virtual field does not survive deletion. Consumers that skip it silently fail to invalidate the deleted page.

**A soft delete is not a delete.** With Payload's Trash enabled, trashing is an `update`: it reaches `afterChange`, never `afterDelete`, and the transition is visible only as `deletedAt` appearing. Unpublishing is likewise an update that removes a path from the live site without changing it. Consumers therefore write `_status` comparisons and `deletedAt` comparisons to answer a question the plugin is better placed to answer: does this path still resolve?

**Descendants move invisibly.** When a parent's slug changes, every descendant's path changes — but no `afterChange` fires for those documents, because their rows never changed. The plugin has the subtree walk (`utils/childDocumentsOf.ts:12`); a consumer has, at best, a full-cache purge on any path change, and more commonly nothing at all, leaving every nested page stale until something else evicts it.

### Both halves must agree

Enumeration and change detection answer the same question from opposite directions: which paths resolve now, and which stopped or started resolving. If they disagree on what "resolves" means — draft, trashed, access-restricted — a consumer's sitemap and cache drift apart, and the symptom appears days later as a stale or missing page.

## Proposal

One module, `queries/pathIndex.ts`, exposing two functions over one internal liveness predicate that also backs `findPageByPath`.

### `listPagePaths`

```ts
listPagePaths(args: {
  req: PayloadRequest
  collections?: CollectionSlug[]
  draft?: boolean
  locale?: string
  where?: Where
}): Promise<PagePathEntry[]>

type PagePathEntry = {
  collection: CollectionSlug
  id: DefaultDocumentIDType
  locale?: string
  path: string
  title: null | string
  updatedAt: string
}
```

Defaults to every registered page collection, published only, not trashed, scoped by the plugin's `baseFilter`. `where` is merged per collection with `and`, never replacing the plugin's own conditions — application rules such as excluding pages flagged as noindex compose on top and stay application knowledge.

`title` comes from each collection's `breadcrumbs.labelField`, because a caller that wants a sitemap or a navigation dump otherwise needs a second query per collection to learn a field name the plugin already holds.

Returns data, not XML. Sitemap, robots.txt and llms.txt serialization are product decisions and stay with the consumer.

### `pathChanges`

An exported helper the consumer calls from **their own** hook, not a plugin option:

```ts
import { pathChanges } from '@jhb.software/payload-pages-plugin'

// in any page collection's own afterChange / afterDelete
afterChange: [
  async (args) => {
    const changes = await pathChanges(args)
    void invalidate(changes) // consumer decides whether to await
  },
]

type PathChange = {
  collection: CollectionSlug
  id: DefaultDocumentIDType
  locale?: string
  /** null when the path did not resolve before this write. */
  previousPath: null | string
  /** null when the path no longer resolves after this write. */
  path: null | string
}
```

A helper rather than an `onPathChange` plugin option, for four reasons. A plugin option is a **single slot**, and path changes plainly have more than one interested party — cache invalidation, a sitemap refresh, a search index. A hook array composes; an option forces consumers to hand-multiplex. The consumer keeps control of `await` versus fire-and-forget, which matters because blocking a publish on a network call is a decision only they can make. Ordering relative to their other hooks stays theirs. And a plain function is testable without booting a plugin config.

The claim that a plugin option saves per-collection wiring does not survive contact with practice: consumers already wire per-collection revalidation hooks by hand.

### Five fields, no enums

There is deliberately no `reason` and no `cause`. Grouping the lifecycle events by what a consumer actually _does_ collapses them to three behaviours, all determined by the two nullable strings:

| Lifecycle                     | Shape         | Consumer action     |
| ----------------------------- | ------------- | ------------------- |
| created, published, restored  | `null → '/x'` | warm it, list it    |
| deleted, trashed, unpublished | `'/x' → null` | purge it, delist it |
| moved                         | `'/x' → '/y'` | purge old, warm new |

A seven-member enum would encode Payload's write-lifecycle taxonomy into an interface whose subject is paths, and would grow every time Payload adds a lifecycle feature — Trash alone added two members. `cause: 'self' | 'ancestor'` fails the same test: a descendant whose path moved needs the same invalidation, and the same redirect, as the document the editor renamed.

Adding a field later is additive; removing an enum member is breaking. The asymmetry favours starting narrow.

### The plugin owns liveness

"Resolves" means published **and** not trashed, decided once inside the plugin by the predicate `findPageByPath` and `listPagePaths` also use. Consumers never write `_status === 'published' && !deletedAt` again, and the three functions cannot disagree.

### The plugin owns the delete capture

The plugin registers its own `beforeDelete` on every page collection — it already owns one (`collections/PageCollectionConfig.ts:140-143`) — which re-reads the document's paths and stashes them on `req.context` under a plugin-private key. `pathChanges(afterDeleteArgs)` reads the stash. The consumer's three-part mechanism disappears; the hook argument shape is the only thing they touch.

### Descendants are walked eagerly, and are not optional

`pathChanges` walks the subtree and returns descendant entries inline. The walk runs **only when the document's own path changed** — the plugin already computes that predicate (`hooks/setVirtualFields.ts:140-143`). So:

| Write                              | Walk?                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| Content edit                       | none                                                                             |
| Publish, unpublish, trash, restore | none — a descendant's path is computed from slugs, not from an ancestor's status |
| Hard delete of a parent            | none of consequence; `preventParentDeletion` refuses it (see plan 003)           |
| Slug or parent change              | walks                                                                            |

The cost lands only on a move: editor-initiated, structurally significant, comparatively rare. The walk is batched one query per tree depth with `depth: 0` and a one-field `select`, not one query per document.

No opt-out flag: its only correct value is the default, and its practical function would be to let an install disable correctness. No depth cap: a cap returns a _silently incomplete_ list, which is the exact failure class this seam exists to remove. Complete, or throw.

The latency objection is answered by the helper shape rather than by an option — because the consumer calls `pathChanges` themselves, not awaiting it moves the walk off the response path entirely.

### Per-locale entries

`setVirtualFields` already computes every locale's path internally (`hooks/setVirtualFields.ts:48,67` via `localesFromRequest`). Both functions emit one entry per locale, driven by that computation and **independent of whether the `meta.alternatePaths` field is installed** — a localized install that never assembled that field would otherwise under-purge every non-default locale without any signal. On an unlocalized install `locale` is absent and every entry is singular.

### `pageCollectionSlugs`

```ts
pageCollectionSlugs(collections: CollectionConfig[]): CollectionSlug[]
```

The registry predicate, exported for use at config-build time — before the plugin transforms the config, which is when a consumer needs it to configure a rich-text link feature or their own page picker. Consumers write this three-line filter by hand today.

## Consequences

Purely additive: three new exports, one new plugin-registered `beforeDelete`, no changes to existing signatures or behaviour.

The new `beforeDelete` costs one `findByID` per delete of a page document, with a narrow `select`. Deletes are rare and already run `preventParentDeletion`'s child query on the same hook.

Depends on plan 002. `pathChanges` reads `doc` and `previousDoc` from the consumer's hook arguments — the same documents a narrow `select` strips — so until mutations widen their `select` unconditionally, the event carries paths the plugin was unable to compute.

## Dev app demonstration

**`dev`**

- `src/app/paths/page.tsx` — a page rendering `listPagePaths({ req })` as a table of collection, path, title and `updatedAt`. Adding a page collection to the config makes rows appear with no code change.
- `src/collections/pages.ts` and `src/collections/country-travel-tips.ts` gain an `afterChange` and an `afterDelete` calling `pathChanges` and logging each entry as `previousPath → path`. Renaming a mid-tree page in the admin panel must log the renamed page _and_ every descendant; a content-only edit must log nothing; deleting a leaf must log `'/x' → null`.
- With `trash: true` from plan 003 on those collections, trashing logs `'/x' → null` and restoring logs `null → '/x'` — through `afterChange`, with no `afterDelete` involved.

**`dev_multi_tenant`** — the same `/paths` page, showing that `listPagePaths` returns only the current tenant's paths, and that a rename in one tenant logs no entries for the other.

**`dev_unlocalized`** — the same handler, demonstrating entries without a `locale` member.

## Tests

Failing tests land first, per `CLAUDE.md`.

**`dev/plugin.test.ts` — enumeration**

- Returns every published page across all page collections, and picks up a newly registered page collection with no code change.
- Excludes drafts by default and includes them under `draft: true`.
- Excludes trashed documents; restoring one brings it back.
- A caller `where` composes with the plugin's conditions rather than replacing them — a `where` that would match a draft still does not return it.
- `title` is populated from each collection's configured `breadcrumbs.labelField`, including a collection whose label field is not `title`.

**`dev/plugin.test.ts` — change events**

- Renaming a parent's slug returns exactly one entry per affected document, each carrying `previousPath → path`, covering every descendant at every depth. Restoring the walk's absence makes this fail.
- A content-only edit returns an empty array **and issues no subtree query** — asserted by counting queries, since an empty result would otherwise pass while doing the expensive thing.
- A create returns one entry with `previousPath: null`.
- A hard delete returns one entry with `path: null`, carrying the path the document had — the case that is impossible without the plugin's `beforeDelete` capture.
- Unpublishing returns `path: null`; republishing returns `previousPath: null`. Neither is distinguishable from delete or create in the payload, which is the intent.
- Trashing returns `path: null` and restoring returns `previousPath: null`, both through `afterChange`.
- Moving a document to a new parent returns entries for the document and its descendants, with old and new paths, in one call.
- A narrow `select: { title: true }` on the update that renames a slug still produces complete entries — the plan 002 dependency, pinned here.

**`dev/plugin.test.ts` — agreement**

- For a fixture with drafts, trashed documents and published documents, the set of paths from `listPagePaths` equals the set reachable through `findPageByPath`, and applying every `pathChanges` result to that set reproduces it. This is the test that stops the two halves drifting.

**`dev_multi_tenant/plugin.test.ts`** — both functions are scoped by `baseFilter`: enumeration returns one tenant's paths, and a rename in one tenant produces no entries mentioning the other.

**`dev_unlocalized/plugin.test.ts`** — entries omit `locale`; a rename produces exactly one entry per document rather than one per locale.

**`test/`** (unit) — `pageCollectionSlugs` returns page collections only, in config order, and ignores collections carrying an unrelated `page` property that is not a page config.

## Non-goals

- **No `onPathChange` plugin option.** See above.
- **No serialization.** `listPagePaths` returns data; sitemap, robots.txt and llms.txt shapes are product decisions.
- **No invalidation transport.** Which cache, which endpoint, which tags, and whether to await — all consumer territory. The helper stops at the path list.
- **No "which pages display this data" events.** A change to a related document that a page renders is not a path change. Consumers that revalidate a product page when a variant changes keep doing that themselves; conflating it here would make the interface unbounded.
- **No `alternatePaths` field changes.** The field stays manually installed and is neither auto-installed nor read by these functions — per-locale entries come from the plugin's own computation instead.
- **No access-control filtering in `listPagePaths`.** It runs with the caller's `req`; a caller wanting unrestricted enumeration passes an appropriate `req`, exactly as with `payload.find`.
- **No pagination.** `listPagePaths` returns everything in scope. A path index that requires paging to be correct is a different feature; revisit with evidence.

## Semver

`feat(pages)`, minor bump. Additive; no `!` marker. Two `CHANGELOG.md` lines: `listPagePaths` enumerates every live path across page collections, and `pathChanges` reports which paths a write started or stopped resolving, including descendants of a renamed parent.
