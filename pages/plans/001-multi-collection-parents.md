---
title: Multi-collection parents (`parent.collection` accepts an array)
description: Let a page collection declare more than one collection its documents may be parented to, so a collection can nest under itself and under other page collections at the same time.
type: feature
readiness: ready
---

## Problem

`page.parent.collection` is a single `CollectionSlug` (`types/PageCollectionConfigAttributes.ts:23-32`), so a collection can nest under itself **or** under another collection, never both.

An e-commerce category collection exposes this: `parent: { collection: 'pages' }` routes categories off a page (`/shop/summerwear`) but forbids `/shop/mens/swimwear`; `parent: { collection: 'product-categories' }` allows nesting but gives the collection no entry point into the site tree. The tree wants "a category's parent is a page **or** another category". Same shape for docs sections, location hierarchies, knowledge bases.

Payload already supports the field shape — a polymorphic relationship. The plugin never exposes it.

## Prior art: Payload core hierarchies

Core's hierarchy feature is implemented and merged to `main` (`payload/src/hierarchy/`, PR #15769, 2026-07-07, ~15 follow-up fixes since), but is in no released tag — `v3.88.0` ships only `folders/`. All `4.0*` branches are dead (0 commits ahead of `main`).

**It does not overlap this plan.** `hierarchy/types.ts` states it outright — _"Hierarchies are always self-referential — documents can only nest under other documents from the same collection"_ — and `buildParentField.ts` hardcodes `relationTo: collectionSlug`. Core's parent is monomorphic and self-referential, strictly less than what this plan adds.

The architecture is also inverted. Core nests a dedicated taxonomy collection (`folders`, `tags`) and has _other_ collections attach to it via `createTagField`; `allowHasMany: false` is folder-like, `true` is tag-like. So core's **tags** mean "a document belongs to many hierarchy nodes at once" — which is exactly the "No multiple parents per document" non-goal below, and for the same reason: many parents means many paths, which `path` and the path cache cannot represent. Core organises documents; this plugin routes them. They coexist.

Worth tracking rather than adopting:

- `slugPathFieldName` / `titlePathFieldName` / `utils/computePaths.ts` / `utils/buildLocalizedHierarchyPaths.ts` compute a localized slug path _and_ title path — the same job as `path` + `breadcrumbs`. Naming convergence candidate at 1.0, alongside `parentFieldName` / `slugField` / `slugify`.
- `utils/getAncestors.ts` caches the ancestor walk on `req.context`, arriving independently at the same technique as `loadAncestor` (`loadAncestors.ts:118-178`). Corroborates that design.
- PR #17269 resolves hierarchy ancestors using the request's draft intent, corroborating the `draft: true` decision on the cycle walk.
- PR #17769 (`fix(plugin-nested-docs): exclude descendants from parent options`) is the descendant-exclusion non-goal below; revisit with its implementation in hand.

## Where the single-collection assumption lives

| Location                                     | Use                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `fields/parentField.ts:27,42`                | `relationTo`; self-exclusion `filterOptions` guarded on "same collection"                                      |
| `utils/getBreadcrumbs.ts:65-68,93`           | resolves the id of the **first** ancestor from `data`; client-side REST fetch uses `parentCollection`          |
| `utils/loadAncestors.ts:267-268,289-300`     | each hop's next ref: `parentCollection` is the hop's single configured slug, `extractID` discards `relationTo` |
| `utils/setPageVirtualFields.ts:30,85`        | passes `.parent.collection` into `getBreadcrumbs`                                                              |
| `utils/childDocumentsOf.ts:41,83`            | child query + "is this collection parented to that one"                                                        |
| `hooks/preventCircularParentReference.ts:33` | **returns early** on a cross-collection parent                                                                 |
| `components/client/PathField.tsx:27,79`      | client-side breadcrumb fetch while editing                                                                     |
| `components/server/ParentField.tsx:26`       | truthiness check for the `sharedDocument` lock; typed `string \| undefined`, which an object value makes a lie |

`findPageByPath.ts` and `pathCache.ts` need **no change**, verified rather than assumed: `findPageByPath.ts:227` picks its match with `docs.find(doc => doc.path === path)` across every slug match, and cached ids are re-fetched with the real filters (`:169-186`), so stale entries are deleted rather than returned.

### What `loadAncestors.ts` already provides

The perf rework (`perf(pages): reduce db round trips of virtual path generation`, #190) moved the server-side ancestor walk out of `getBreadcrumbs` into `utils/loadAncestors.ts`, which reads ancestors straight off `payload.db`, batched and cached on `req.context`. Three pieces this plan would otherwise have had to build are already there:

- Each hop's parent field name and label field are resolved from **that hop's own** page config (`pageAttributesOf`, `:276-281`), so a chain crossing collections already selects the right columns per level.
- The request cache and the batch queue are keyed on `` `${collection}:${id}` `` / `` `${collection}:${locale}` `` (`:132,141`), so cross-collection walks share the cache correctly without a change.
- The walk keeps an **ordered** `visited` list and throws naming the chain (`:77-84`), in the format `topics:12 -> pages:3 -> topics:8 -> topics:12`.

What is left is narrow: `parentCollection` at `:267` is the hop's single configured slug, and `extractID` (`:289-300`) reduces a relationship value to a bare id, discarding `relationTo`.

One perf consequence: `fetchAncestors` issues one query per (level, collection). A level that spans two collections costs two queries rather than one. The cost stays proportional to tree depth, not to the number of documents being read, which is the property `dev/perf-bench.test.ts` and `dev/hookExecution.test.ts` guard.

## Proposal

Widen `collection` to `CollectionSlug | CollectionSlug[]` in both the incoming and processed types. A single slug keeps today's field type, storage and value shape exactly — existing installs need no migration. An array produces a polymorphic field storing `{ relationTo, value }`.

Payload treats a single-element array as polymorphic. That is supported and documented in the doc comment: declaring `['pages']` up front adopts the polymorphic layout now, so adding slugs later never needs a second migration.

The processed config keeps the union rather than normalizing, so existing readers of `collection.page.parent.collection` keep compiling. Revisit at 1.0.

### The seam: `utils/parentRef.ts` (new)

Pure functions, no Payload dependency beyond types. All seven consumers route through them:

```ts
export function parentCollections(pageConfig): CollectionSlug[]
export function hasPolymorphicParent(pageConfig): boolean

/**
 * Normalizes a stored parent value to the collection and id it points at. Handles an id,
 * a populated document, `{ relationTo, value: id }` and `{ relationTo, value: doc }`.
 * Falls back to the configured collection in the monomorphic case. Null when unset.
 */
export function resolveParentRef(value, pageConfig): null | { collection; id }
```

## Implementation

**`fields/parentField.ts`** — `relationTo` passes through unchanged once the type is widened. `filterOptions` receives `relationTo` per relation, which replaces today's guard. It stays wrapped in `composeFilterOptions` so a user-supplied `parent.filterOptions` is still ANDed on:

```ts
filterOptions: composeFilterOptions(
  ({ data, relationTo }) =>
    !data.id || relationTo !== collectionSlug ? true : { id: { not_equals: data.id } },
  overrides?.filterOptions,
)
```

The `admin` override is typed `SingleRelationshipField['admin']` here (`:45`) and on the incoming config (`PageCollectionConfigAttributes.ts:52`). Both widen to `RelationshipField['admin']`, which is a pure widening — no consumer's existing override stops compiling.

The `sharedDocument` `defaultValue` (`:59-97`) needs no unpacking change — its `depth: 0` lookup already yields `{ relationTo, value }` for a polymorphic field. Pin with a test, not by inspection.

**`utils/getBreadcrumbs.ts`** — not exported from `index.ts`, so the signature is free: replace `breadcrumbLabelField` / `parentCollection` / `parentField` with one `pageConfig`. The unpacking at `:65-68` becomes `resolveParentRef`, and the ref's collection drives both the `loadAncestorChain` call and the client REST URL at `:93`. On the server path `parentCollection` is only the walk's starting point; every hop after it resolves its own.

**`utils/loadAncestors.ts`** — the substantive change, and it is small because the walk is already collection-aware:

- `AncestorRow.parentId` / `parentCollection` become one `parent: { collection, id } | null`, produced by `resolveParentRef(doc[parentFieldName], pageAttributes)` instead of `extractID` + the hardcoded `pageAttributes.parent.collection` (`:267-268`).
- `loadAncestorChain`'s `next` already carries `{ collection, id }`, so the loop body is unchanged.
- The batch fetch already selects per collection, so a polymorphic level naturally splits into one batch per collection.
- Cycle detection, cache keys and the error message stay exactly as they are.

**`utils/setPageVirtualFields.ts`** — both call sites pass `pageConfigAttributes` through.

**`hooks/preventCircularParentReference.ts`** — the change with real logic. Once a collection can be parented to itself _and_ to another page collection, `A(category) → B(page) → C(category) → A` is reachable and makes `getBreadcrumbs` recurse until the request dies. So:

- Drop the early return at `:33`; run whenever the collection has a parent field.
- The cursor becomes a `{ collection, id }` pair via `resolveParentRef`. Key `visited` on `` `${collection}:${id}` ``, kept **ordered** so the error can name the chain.
- Read each hop's parent field name from _its own_ page config (`asPageCollectionConfigOrThrow`) — collections name it independently (`country-travel-tips` uses `country`).
- Stop on a hop with no parent, or on a non-page collection.
- Keep the "parent unchanged" short-circuit at `:53-62`, comparing resolved refs. The walk therefore only runs when the parent actually changes.

The ancestor fetch adopts the options `loadAncestors` uses and today's hook does not: `overrideAccess: true` (a structural invariant, not a user read — otherwise an editor who may write categories but not read `pages` hits an access error on save), `disableErrors: true` (a missing ancestor ends the walk instead of failing the save), `draft: true`, `depth: 0`, one-field `select`.

Error message names the chain, which is free because `visited` already holds it ordered, in the format `loadAncestors.ts:81` already emits:

```
Circular parent reference detected: topics:12 -> pages:3 -> topics:8 -> topics:12
```

`collection:id` rather than titles keeps the one-field `select` intact. Both messages stay hardcoded English, matching `:67` and `:84` today.

**`utils/childDocumentsOf.ts`** — two changes:

- `isPageCollectionWithParent` (`:83`) becomes `parentCollections(collection.page).includes(expectedParentCollectionSlug)`.
- The child query (`:41`) matches on id alone, and **ids collide across collections in Postgres** — deleting page `42` would report category `42` as its child. Payload 3.87.1 supports polymorphic object notation natively in both adapters (`@payloadcms/drizzle/…/sanitizeQueryValue.js:118` via `isPolymorphicRelationship`, `@payloadcms/db-mongodb/…/sanitizeQueryValue.js:208`), so no dotted path is needed:

  ```ts
  { [parentFieldName]: { equals: isPolymorphic ? { relationTo: collectionSlug, value: docId } : docId } }
  ```

  Drizzle throws an `APIError` for any operator but `equals` on this notation.

The `try`/`catch` that swallowed a failed child lookup — which `preventParentDeletion` read as "safe to delete", silently orphaning documents — was the safety net this query form needs. It has since been removed on `main` by `fix(pages)!: apply the parent-deletion guard to trashed documents` (#195), so it is no longer part of this change.

**`components/client/PathField.tsx`** — resolve `parent` (`:35`) with `resolveParentRef`. The effect at `:89-117` depends on `[parent]`; an object identity re-triggers it every render, refetching breadcrumbs in a loop, so depend on `` `${ref?.collection}:${ref?.id}` ``. Same for the reads at `:92` and `:127`.

**`components/server/ParentField.tsx`** — correct the `string | undefined` annotation on `:26`; behaviour is already right.

**`plugin.ts`** — two init-time throws naming the offending collection and slug:

- Every slug in `parent.collection` must be a registered page collection — **including the string form**. Such a config boots today and fails later with a confusing breadcrumb error. Behaviour change, listed below.
- `sharedDocument: true` may not list the collection's own slug in `parent.collection`. Shared parent and nestable tree are contradictory: `parentField.ts:63-77` copies the first document's parent, so every new document would inherit an arbitrary sibling's. `sharedDocument` with a polymorphic parent that excludes the collection itself stays supported and coherent (`blogposts` under `['pages', 'topics']`).

## Dev app demonstration

A **new** `topics` page collection in all three dev apps (`dev`, `dev_unlocalized`, `dev_multi_tenant`):

```ts
page: {
  parent: { collection: ['pages', 'topics'], name: 'parent' },
  // Siblings under different parents may share a slug; the default collection-wide
  // constraint forbids /shop/mens/shirts alongside /shop/womens/shirts.
  slug: { unique: false },
}
```

`blogpost-categories` is **not** reused — it is deliberately a non-page collection testing `slugField` outside a page context.

Clickable in the admin panel: topic under a page → `/some-page/topic`; topic under a topic → `/some-page/topic/sub-topic` with breadcrumbs spanning both collections; `/shop/mens/shirts` and `/shop/womens/shirts` both resolving; re-parenting a topic to its own descendant rejected with the chain named; deleting a page a topic hangs off rejected.

`dev_multi_tenant` exercises `baseFilter` with a polymorphic parent, `dev_unlocalized` the unlocalized `getBreadcrumbs` branch. Both build the schema on mongodb and sqlite.

## Tests

Failing tests land first, per `CLAUDE.md`.

**`test/parentRef.test.ts`** (new, unit) — resolves a bare id, a populated doc, `{ relationTo, value: id }`, `{ relationTo, value: doc }`; null for unset.

**`test/getBreadcrumbs.test.ts`** (extend) — the client branch resolves the REST URL from the ref's collection rather than the configured one.

**`dev/plugin.test.ts`** (full integration suite)

- A cross-collection cycle is rejected, naming the chain. Restoring the early return makes this fail.
- A same-collection cycle is still rejected with a polymorphic parent field.
- Full breadcrumbs for a page → topic → topic chain, asserting each breadcrumb's `slug`/`label`/`path`. This belongs here rather than in the unit test: the server walk now reads through `payload.db`, so it needs a real database.
- Deleting a parent with children in another collection is refused when referenced polymorphically.
- Deleting a document whose id collides with a child's parent id in another collection succeeds — the test that catches `{ parent: { equals: id } }`. Only reproduces on sqlite/postgres (ObjectIds never collide) and needs controlled seeding order to produce the colliding ids.
- A document parented across collections resolves through `findPageByPath`, cold and cached.
- Monomorphic parents still save, resolve and refuse deletion of their parent.
- `sharedDocument` with a polymorphic parent assigns the shared `{ relationTo, value }` to a second new document.

**`dev/perf-bench.test.ts` / `dev/hookExecution.test.ts`** (extend) — listing N documents whose ancestor chain alternates between two collections stays proportional to tree depth, not to N. Guards the batching in `fetchAncestors` against a regression to one query per document once a level can span collections.

**`dev_unlocalized/plugin.test.ts`** — breadcrumbs across collections with localization disabled.
**`dev_multi_tenant/plugin.test.ts`** — `childDocumentsOf` honours `baseFilter` against a polymorphic parent.

## Compatibility and migration

The feature is additive, but one behaviour change rides along and is breaking under `CLAUDE.md`: an invalid `parent.collection` now throws at startup instead of at request time. (The second one this plan originally carried — a failing child-document lookup blocking the delete — shipped separately in #195.)

Opting an existing collection into an array is a **storage change** (Postgres: FK column → `_rels` join table; MongoDB: value → `{ relationTo, value }`). The plugin cannot automate it — it cannot know which collections changed shape, and on SQL adapters the copy must run _inside_ the generated migration, between creating the `_rels` rows and dropping the column, where an exported JS helper would run too late. A README section documents the recipe per adapter instead:

```sql
-- Postgres: in the generated migration, BEFORE `DROP COLUMN parent_id`
INSERT INTO topics_rels (parent_id, path, pages_id)
SELECT id, 'parent', parent_id FROM topics WHERE parent_id IS NOT NULL;
```

```js
// MongoDB: no schema step; run once before deploying
db.topics.updateMany({ parent: { $type: 'objectId' } }, [
  { $set: { parent: { relationTo: 'pages', value: '$parent' } } },
])
```

Declaring `['pages']` up front avoids ever needing this a second time.

**Semver**: `feat(pages)!:` with a `BREAKING CHANGE:` footer, same marker on the PR title, `minor` bump (pre-1.0). `CHANGELOG.md` gets one additive line linking the migration section and one `**BREAKING**:` line for the startup validation.

## Non-goals

- **No multiple parents per document.** Only the set of collections a parent may live in widens. Multi-parent means multiple paths, which the virtual `path` field and the path cache cannot represent.
- **No descendant exclusion in the parent picker.** `filterOptions` excludes only the document itself; picking a descendant is still caught on save. A separate UX improvement — see payload#17769 for core's approach.
- **No changes to `findPageByPath` or the path cache.** Pinned by the integration test above.
- **No parent-scoped slug uniqueness.** `slugField.ts:26` sets `unique: true` collection-wide, so two documents in one collection cannot share a slug even under different parents. Already true for `pages` under `pages`, but deep self-nesting makes it the first thing a user hits — the README gains a note that self-nesting collections usually want `slug: { unique: false }`, and the `topics` fixture sets it. A compound `(parent, slug)` index is its own plan.
- **No cross-collection slug uniqueness.** Two documents in different collections can already produce the same path; collisions stay resolved by scan order.
- **No translation keys for the cycle errors.** Both are hardcoded English today; a separate fix.
- **No alignment with core hierarchies.** Different primitive, no overlap. See "Prior art".
- **No automatic migration helper.** See above.
