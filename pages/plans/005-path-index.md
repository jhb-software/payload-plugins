---
title: Path index — enumerate paths and observe path changes
description: The plugin exposes one third of a path index: resolve one path. Enumeration and change detection are reimplemented by every consumer that has a sitemap or a cache, incorrectly in the cases that matter most.
type: feature
readiness: ready
---

## Problem

`findPageByPath` (`queries/findPageByPath.ts`) answers one question: which document does this path resolve to? The plugin owns two more answers and publishes neither.

### Which paths exist

Only the plugin knows which collections are page collections — it stashes `custom.pageConfig` on each during config transformation (`collections/PageCollectionConfig.ts:92-97`), after the consumer's config is built. Anything that needs "every live path" must therefore re-derive the list and re-apply the liveness rules by hand:

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

`setVirtualFieldsAfterChange` (`hooks/setVirtualFields.ts:89`) computes the path and already determines whether the fields it depends on changed (`:140-143`). At that moment the plugin knows more about what happened to the path than any consumer can reconstruct. It emits nothing, so a consumer that needs to invalidate a cache or ping a revalidation endpoint rebuilds the answer from `doc` and `previousDoc`. That reconstruction fails in five distinct ways, each of which is plugin knowledge leaking.

**`previousDoc` does not hold the previous live path.** `updateByID` fetches the document it will pass as `previousDoc` through `getLatestCollectionVersion` **without** the `published` flag (`payload/dist/collections/operations/updateByID.js:79`, forwarded at `utilities/update.js:324`), so on a drafts-enabled collection it resolves the `latest: true` version row — regardless of whether the write itself is a draft save. In the central flow, renaming a page in a draft and then publishing it, `previousDoc.slug` is therefore already the _new_ slug: `previousDoc.path === doc.path`, the diff comes out empty, and the old URL is never invalidated. A consumer cannot detect this from the hook arguments, because the published state is simply not among them.

**A draft save looks like an unpublish.** `doc._status` is `'draft'` while `previousDoc._status` is `'published'` on every draft save and every autosave tick of a published page. The naive comparison reads that as an unpublish and purges a live URL that did not change, on every keystroke-driven autosave.

**The path may not be there.** A caller's narrow `select`, a failed ancestor walk, or an unset slug all yield a document without `path` (`hooks/setVirtualFields.ts:53-56`, `:111-113`, `:123-133`). Consumers write defensive guards — throwing, or logging and skipping — against the plugin's own contract.

**A delete carries no path.** `path` is virtual, so it is absent from the document passed to `afterDelete`. The workaround is a `beforeDelete` hook that re-reads the document, stashes its path on `req.context`, and a matching `afterDelete` that reads the stash back — a three-part mechanism that exists purely because a virtual field does not survive deletion. Consumers that skip it silently fail to invalidate the deleted page.

**A soft delete is not a delete.** With Payload's Trash enabled, trashing is an `update`: it reaches `afterChange`, never `afterDelete`, and the transition is visible only as `deletedAt` appearing. Unpublishing is likewise an update that removes a path from the live site without changing it. Consumers therefore write `_status` and `deletedAt` comparisons to answer a question the plugin is better placed to answer: does this path still resolve?

**Descendants move invisibly.** When a parent's slug changes, every descendant's path changes — but no `afterChange` fires for those documents, because their rows never changed. The plugin has the subtree query (`utils/childDocumentsOf.ts:18`) and the ancestor batcher (`utils/loadAncestors.ts`); a consumer has, at best, a full-cache purge on any path change, and more commonly nothing at all, leaving every nested page stale until something else evicts it.

### Both halves must agree

Enumeration and change detection answer the same question from opposite directions: which paths resolve now, and which stopped or started resolving. If they disagree on what "resolves" means — draft, trashed, access-restricted — a consumer's sitemap and cache drift apart, and the symptom appears days later as a stale or missing page.

## Proposal

One module, `queries/pathIndex.ts`, exposing two functions over one internal liveness predicate that also backs `findPageByPath`, plus the registry predicate the plugin already has internally.

Both functions carry the same `@experimental` marker as `findPageByPath`: they form one API with it, and marking them differently would imply the three can be relied on to different degrees.

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

Defaults to every registered page collection, published only, not trashed, scoped by the plugin's `baseFilter`. `where` is merged per collection with `and`, never replacing the plugin's own conditions.

`title` comes from each collection's `breadcrumbs.labelField`, because a caller that wants a sitemap or a navigation dump otherwise needs a second query per collection to learn a field name the plugin already holds.

`draft: true` enumerates latest versions instead of published ones, mirroring `findPageByPath`. It has no `pathChanges` counterpart, by design: a draft write cannot change a live path.

On a localized install the default is one entry per (document, locale), and `locale` narrows to one. Per-locale entries are free — `setPageDocumentVirtualFields` already builds the full per-locale `paths` record in one pass and discards all but one (`utils/setPageVirtualFields.ts:35-47`) — and they mirror `pathChanges`, so the two halves stay directly comparable. A locale whose slug is unset yields no entry, matching the path computation. On an unlocalized install `locale` is absent from every entry.

Returns data, not XML. Sitemap, robots.txt and llms.txt serialization are product decisions and stay with the consumer.

### `pathChanges`

An exported helper the consumer calls from **their own** hook, not a plugin option:

```ts
import { pathChanges } from '@jhb.software/payload-pages-plugin'

// in any page collection's own afterChange / afterDelete
afterChange: [
  async (args) => {
    const changes = await pathChanges(args)
    await invalidate(changes)
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

The consumer's hook is guaranteed to see a computed `path` on `doc`: `setVirtualFieldsAfterChange` is prepended to every page collection's `afterChange` array (`collections/PageCollectionConfig.ts:141-144`), so it always runs first.

### Five fields, no enums

There is deliberately no `reason` and no `cause`. Grouping the lifecycle events by what a consumer actually _does_ collapses them to three behaviours, all determined by the two nullable strings:

| Lifecycle                     | Shape         | Consumer action     |
| ----------------------------- | ------------- | ------------------- |
| created, published, restored  | `null → '/x'` | warm it, list it    |
| deleted, trashed, unpublished | `'/x' → null` | purge it, delist it |
| moved                         | `'/x' → '/y'` | purge old, warm new |

A seven-member enum would encode Payload's write-lifecycle taxonomy into an interface whose subject is paths, and would grow every time Payload adds a lifecycle feature — Trash alone added two members. `cause: 'self' | 'ancestor'` fails the same test: a descendant whose path moved needs the same invalidation, and the same redirect, as the document the editor renamed.

Adding a field later is additive; removing an enum member is breaking. The asymmetry favours starting narrow.

### The plugin owns liveness, and it is not configurable

"Resolves" means published **and** not trashed, decided once inside the plugin by the predicate `findPageByPath` and `listPagePaths` also use. The moment liveness becomes configurable the three functions can disagree again, which is the failure this module exists to prevent. Two adjacent rules therefore stay outside it:

- **Indexability** — a noindex flag decides whether a path belongs in a sitemap, not whether it resolves. A noindex page still has a live URL that must be invalidated when it moves, so folding the flag into liveness would under-purge. It belongs in the caller's `where`, on the sitemap call only.
- **Visibility** — an application-specific access level is the consumer's rule. When it flips, the path is unchanged and `pathChanges` correctly returns nothing; the consumer adds a one-line comparison of their own field. Modelling it here would make the interface unbounded.

A filter that applies to one collection but not another needs no extra argument shape: call `listPagePaths` once per collection with that collection's `where` and concatenate. Keeping the argument a single `Where` avoids a union type on the hot path and a keyed-record form in which a mistyped slug silently filters nothing.

### The plugin captures the previous live state

Because `previousDoc` is the latest version row rather than the published one, the previous live path cannot be derived from the hook arguments at all on a drafts-enabled collection. The plugin therefore registers two hooks on every page collection that stash the pre-write state on `req.context`, keyed by document id so bulk writes and bulk deletes work:

- `beforeChange` — records the current live paths (all locales) and whether the document was live at all.
- `beforeDelete` — records the same, replacing the three-part mechanism consumers write today. The plugin already owns a `beforeDelete` (`collections/PageCollectionConfig.ts:155-158`).

Both **return immediately when `req.context.draft === true`** (set by `selectDependentFieldsBeforeOperation`, `hooks/selectDependentFieldsBeforeOperation.ts:26-28`). A draft save or autosave tick writes only a version row and cannot change a live path, so it costs no extra read and `pathChanges` returns `[]` for it — which is exactly the case consumers get wrong today. The extra read lands only on writes that can actually move a live URL: publish, unpublish, trash, restore, delete.

`pathChanges` then computes, per locale:

- `previousPath` — from the capture; falls back to `previousDoc` only on a collection without drafts, where `previousDoc` _is_ the main row and is already correct.
- `path` — the live path after the write: the computed path when the document is live, `null` otherwise.

An entry is emitted only where `previousPath !== path`, so renaming one locale's slug does not purge the URLs of the locales that did not move.

Both reads are scoped by the plugin's `baseFilter`, like every other query the plugin issues.

### Descendants are walked eagerly, and are not optional

The walk runs **iff `previousPath` and `path` are both non-null and differ** — that is, only on a genuine move. Publish, unpublish, trash and restore change liveness without changing any slug, so no descendant path moves; a create has no descendants. The rule is derived from captured state, not from `previousDoc`, so it survives the version-row problem.

| Write                              | Walk?                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| Content edit, draft save, autosave | none                                                                             |
| Publish, unpublish, trash, restore | none — a descendant's path is computed from slugs, not from an ancestor's status |
| Slug or parent change (published)  | walks                                                                            |
| Hard delete of a parent            | only when `preventParentDeletion` is disabled (see below)                        |

Descendant paths are built by **prefix substitution**, not by recomputation. A path is exactly `[/locale, ...ancestorSlugs, ownSlug].join('/')` (`utils/pathFromBreadcrumbs.ts:12-17`), so a descendant's two paths are the changed document's `previousPath` and `path` concatenated with the descendant's own slug tail. This is not an optimisation but a correctness requirement: recomputing a descendant's path through `getBreadcrumbs` on the same request can return the _stale_ path, because the request-scoped ancestor cache (`utils/loadAncestors.ts:130-134`, keyed `collection:id:locale`) may already hold the pre-update row for the document that was just renamed. Substitution also recovers old paths that no longer exist to be queried.

The walk itself is a new internal `utils/loadDescendants.ts`, mirroring `loadAncestors`: it reads through `payload.db` with `{ parent: { in: ids } }`, one query per (tree depth × candidate collection), selecting only id, slug and parent ref, and applying `baseFilter`. Reading at the database level keeps descendant collections' hooks from firing, matching the reasoning already documented in `loadAncestors.ts`. `childDocumentsOf` keeps its current signature and single-id semantics; it is a public export and is not touched.

Batching by depth is not merely cheaper: inside `afterChange` the walk runs on the caller's transaction, where MongoDB forbids concurrent operations on one session and Postgres serialises them on one connection, so per-document queries could not be parallelised away.

No opt-out flag: its only correct value is the default, and its practical function would be to let an install disable correctness. No depth cap: a cap returns a _silently incomplete_ list, which is the exact failure class this seam exists to remove. Complete, or throw.

### Orphaned descendants of a hard-deleted parent

`preventParentDeletion` can be disabled (`collections/PageCollectionConfig.ts:157`). With the guard enabled a delete implies the document had no children — the guard would have thrown otherwise — so `pathChanges` issues no subtree query on delete at all. With the guard disabled, deleting a parent leaves descendants whose ancestor walk now throws and whose URLs break with no hook firing for them; in that configuration the `beforeDelete` capture also walks the subtree and emits `previousPath → null` for every descendant. Correct in both configurations, free in the default one.

### Failure is loud

`pathChanges` rejects rather than returning a short list: a silently incomplete purge is the failure class this seam removes. Because a rejection inside a bare `void pathChanges(args)` would surface as an unhandled rejection, the README never shows that form. It shows either awaiting inside the consumer's hook, or `void pathChanges(args).then(invalidate).catch(logger.error)` for the non-blocking case.

### `isPageCollectionConfig`

`utils/pageCollectionConfigHelpers.ts:7` already holds the registry predicate; it is simply not exported from the package. Exporting it lets consumers derive the slug list at config-build time — before the plugin transforms the config, which is when it is needed to configure a rich-text link feature or a page picker — and serves every other "is this a page collection" question from the same source. A dedicated `pageCollectionSlugs(collections)` helper is deliberately not added: it is one `.filter().map()` away from the predicate, and the predicate is the more general of the two.

## Consequences

Three new exports (`listPagePaths`, `pathChanges`, `isPageCollectionConfig`), one new plugin-registered `beforeChange`, one addition to the existing `beforeDelete`, no changes to existing signatures. `findPageByPath` is refactored to take its published-and-not-trashed condition from the shared liveness predicate rather than building it inline (`queries/findPageByPath.ts:137-152`) — no behaviour change, but it is what makes the three functions structurally unable to disagree.

The capture costs one narrow read per non-draft write of a page document, and nothing at all on draft saves and autosave. Deletes already run `preventParentDeletion`'s child query on the same hook.

Enumeration cost is bounded by tree depth, not by document count: one `find` per collection plus one ancestor query per (collection × depth), shared across every document in the request by the batcher in `loadAncestors.ts:107-160`. This is also why `listPagePaths` is not paginated — splitting one request into many would break that batching and make the paged path slower than the unpaged one.

## Dev app demonstration

**`dev`**

- `src/app/demo/path-index/route.ts` — a `GET` returning `listPagePaths({ req })` as JSON. Adding a page collection to the config makes entries appear with no code change.
- `src/collections/pages.ts` and `src/collections/country-travel-tips.ts` gain an `afterChange` and an `afterDelete` calling `pathChanges` and logging each entry as `previousPath → path`. The clickable checks: renaming a mid-tree page logs the renamed page _and_ every descendant; a draft save logs nothing; publishing logs `null → '/x'`; unpublishing and trashing log `'/x' → null`; restoring logs `null → '/x'`; deleting a leaf logs `'/x' → null`.

**`dev_multi_tenant`** — the same route, showing that `listPagePaths` returns only the current tenant's paths, and that a rename in one tenant logs no entries for the other.

**`dev_unlocalized`** — the same route, demonstrating entries without a `locale` member.

## Tests

Failing tests land first, per `CLAUDE.md`. The db instrumentation in `dev/perf-bench.test.ts:53-105` is extracted into `dev/src/test/` so query counts can be asserted.

**`dev/plugin.test.ts` — enumeration**

- Returns every published page across all page collections, and picks up a newly registered page collection with no code change.
- Excludes drafts by default and includes them under `draft: true`.
- Excludes trashed documents; restoring one brings it back.
- A caller `where` composes with the plugin's conditions rather than replacing them — a `where` that would match a draft still does not return it.
- `title` is populated from each collection's configured `breadcrumbs.labelField`, including a collection whose label field is not `title`.
- One entry per locale by default; a locale with an unset slug produces none.

**`dev/plugin.test.ts` — change events**

- **Renaming a slug in a draft and then publishing returns the previously published path as `previousPath`.** Sourcing `previousPath` from `previousDoc` makes this fail, which is the regression this design exists to prevent.
- A draft save of a published page returns an empty array **and issues no capture read** — asserted by counting queries.
- An autosave tick returns an empty array.
- Renaming a parent's slug returns exactly one entry per affected document, each carrying `previousPath → path`, covering every descendant at every depth. Removing the walk makes this fail.
- A content-only edit returns an empty array **and issues no subtree query** — asserted by counting queries, since an empty result would otherwise pass while doing the expensive thing.
- A create returns one entry with `previousPath: null`.
- A hard delete returns one entry with `path: null`, carrying the path the document had — the case that is impossible without the plugin's `beforeDelete` capture. A bulk delete returns one entry per deleted document.
- Unpublishing returns `path: null`; republishing returns `previousPath: null`. Neither is distinguishable from delete or create in the payload, which is the intent.
- Trashing returns `path: null` and restoring returns `previousPath: null`, both through `afterChange`.
- Moving a document to a new parent returns entries for the document and its descendants, with old and new paths, in one call.
- Renaming only one locale's slug returns an entry for that locale only.
- With `preventParentDeletion: false`, hard-deleting a parent returns `previousPath → null` entries for its descendants.
- A missing ancestor makes `pathChanges` reject rather than return a short list.
- A narrow `select: { title: true }` on the update that renames a slug still produces complete entries.

**`dev/plugin.test.ts` — agreement**

- For a fixture with drafts, trashed documents and published documents, the set of paths from `listPagePaths` equals the set reachable through `findPageByPath`, and applying every `pathChanges` result to that set reproduces it. This is the test that stops the two halves drifting.

**`dev_multi_tenant/plugin.test.ts`** — both functions are scoped by `baseFilter`: enumeration returns one tenant's paths, and a rename in one tenant produces no entries mentioning the other.

**`dev_unlocalized/plugin.test.ts`** — entries omit `locale`; a rename produces exactly one entry per document rather than one per locale.

**`test/`** (unit) — `isPageCollectionConfig` identifies page collections and ignores a collection carrying an unrelated `page` property that is not a page config; prefix substitution assembles descendant paths for nested, cross-collection and localized cases.

## Non-goals

- **No `onPathChange` plugin option.** See above.
- **No configurable liveness.** Indexability and application visibility rules stay with the consumer.
- **No serialization.** `listPagePaths` returns data; sitemap, robots.txt and llms.txt shapes are product decisions.
- **No invalidation transport.** Which cache, which endpoint, which tags, and whether to await — all consumer territory. The helper stops at the path list.
- **No "which pages display this data" events.** A change to a related document that a page renders is not a path change. Conflating it here would make the interface unbounded.
- **No `alternatePaths` field changes.** The field stays manually installed and is neither auto-installed nor read by these functions — per-locale entries come from the plugin's own computation instead, so a localized install that never assembled the field is still covered.
- **No access-control filtering in `listPagePaths`.** It runs with the caller's `req`, exactly as with `payload.find`.
- **No pagination.** See the cost note under Consequences.

## Semver

`feat(pages)`, minor bump. Additive; no `!` marker. Two `CHANGELOG.md` lines: `listPagePaths` enumerates every live path across page collections, and `pathChanges` reports which paths a write started or stopped resolving, including descendants of a renamed parent. Both noted as experimental.

Delete this plan in the PR that ships it, per `CLAUDE.md`.
