---
title: Scoped slug uniqueness and one partition filter
description: `slug.unique` is a collection-wide constraint, which is wrong the moment documents are partitioned by tenant or nested under different parents. Widen it to name the fields it is unique *with*, and fold `redirectValidationFilter` into `baseFilter` so the partition is expressed once.
type: feature
readiness: ready
---

## Problem

### Collection-wide slug uniqueness is the wrong default twice over

`slugField` defaults to `unique: true` (`fields/slugField.ts:28`), applied through `pageSlugField` at `collections/PageCollectionConfig.ts:105-109` from `page.slug.unique` (`types/PageCollectionConfigAttributes.ts:44`). It emits a field-level unique index across the whole collection.

That is correct only for a flat, single-partition collection. Two situations break it, and both are ordinary:

**Partitioned documents.** When a collection is scoped by a tenant, site, workspace or brand field, two partitions both want `/about`. The collection-wide index forbids it. The only escape today is `slug: { unique: false }` plus a hand-written compound index in the collection config — repeated once per page collection, and silently omitted by anyone who does not think of it, who then ships with no uniqueness guarantee at all.

**Nested documents.** Plan 001 records this as an explicit non-goal: with self-nesting collections, `/shop/mens/shirts` and `/shop/womens/shirts` are two documents sharing the slug `shirts` under different parents. Collection-wide uniqueness forbids the second. The same escape hatch applies, with the same cost.

Both want the same thing — _unique within a group_ — and the plugin already knows the slug field's name and identity. It is missing only the group.

### The partition is expressed as two callbacks

`PagesPluginConfig` carries `baseFilter` (`types/PagesPluginConfig.ts:11`) and `redirectValidationFilter` (`:57`). They are the same concept twice: "documents are partitioned, and a query must stay inside one partition." They differ only in what the partition is derived from — `baseFilter` from the request, `redirectValidationFilter` from the document being validated (`hooks/validateRedirect.ts:23-25`).

A caller configuring a partition must therefore write it twice, in two shapes, and understand which one applies where. The second callback exists because the first one's signature is too narrow, not because there are two ideas.

### Slug normalization is undocumented

`formatSlug` is exported, but a data migration cannot call TypeScript from SQL. A backfill that generates slugs in a migration must reimplement the normalization, and today it does so by reading the source or by guessing — diverging on transliteration of non-ASCII characters without knowing it diverged.

## Proposal

### 1. `slug.unique` names its group

```ts
page: {
  slug: {
    // today, unchanged
    unique: true,
    // or
    unique: { with: ['tenant'] },
    unique: { with: ['parent'] },
    unique: { with: ['tenant', 'parent'] },
  },
}
```

The incoming and processed types widen to `boolean | { with: string[] }` (`types/PageCollectionConfigAttributes.ts:44,84`). `true` and `false` behave exactly as today, so no existing install changes.

`{ with: [...] }` sets the slug field's own `unique` to `false` and adds a collection-level compound index instead:

```ts
indexes: [
  ...(incomingCollectionConfig.indexes ?? []),
  { fields: ['slug', ...pageConfig.slug.unique.with], unique: true },
]
```

Payload supports collection-level compound indexes (`payload/dist/collections/config/types.d.ts:573`). The plugin composes with any the consumer already declared rather than replacing them.

Validation at init, throwing and naming the collection: every field in `with` must exist on the collection, and `with` must be non-empty. A typo'd field name would otherwise produce either a broken index or none.

### 2. `baseFilter` absorbs `redirectValidationFilter`

```ts
baseFilter?: (args: { doc?: unknown; req: PayloadRequest }) => Where
```

`doc` is present only when the plugin is filtering on behalf of a specific document — today, redirect validation. Every other call site passes `req` alone, so existing single-argument implementations keep compiling and keep working.

A partition filter is then written once:

```ts
baseFilter: ({ req, doc }) => ({
  tenant: { equals: doc ? doc.tenant : resolveTenantFromRequest(req) },
})
```

`redirectValidationFilter` is marked `@deprecated` in the doc comment with a stated removal at 1.0. When set it still takes precedence for redirect validation, so no install changes behaviour on upgrade. It is not left blessed as an escape hatch — an escape hatch that is documented as equally valid is one nobody migrates off.

### 3. Document the slug rules

A README section states the normalization `formatSlug` performs, in prose precise enough to reimplement in SQL: case folding, transliteration of non-ASCII characters, the separator, and how leading, trailing and repeated separators are handled. A backfill can then match it deliberately, or diverge deliberately, instead of by accident.

The same README pass adds a short note that a page picker built by hand — a `relationship` field targeting page collections, or the rich-text internal-link feature — must apply the install's own `baseFilter` through `filterOptions`, because the plugin does not descend into fields it did not create. A picker without it offers documents from other partitions and nothing catches it.

## Spikes, before implementation

Two questions gate the scope, and both are cheap to answer with a fixture:

**Can a compound index target a polymorphic parent?** Plan 001 lets `parent.collection` be an array, which stores `{ relationTo, value }` — a `_rels` join table on Postgres, an object on MongoDB. `with: ['parent']` may be unrepresentable as an index on either. If it is not, `with: ['parent']` is dropped from this plan, `with: ['tenant']` ships alone, and plan 001's non-goal stays open with a recorded reason. It does **not** block the tenant case.

**Do trashed rows break the constraint?** Payload's Trash keeps the row, so a trashed document still occupies its `(slug, tenant)` pair — an editor recreating a page they just trashed hits a unique-constraint error about a document they cannot see. Payload's `CompoundIndex` has no `where`, so a partial index (`WHERE deleted_at IS NULL`) is not expressible through it. Determine whether adding `deletedAt` to the index tuple gives usable semantics; if not, document the limitation plainly in the README rather than working around it.

## Consequences

Additive. Existing installs set `unique: true` or `unique: false` and see no change; the new object form is opt-in per collection.

Adopting `{ with: [...] }` on an existing collection is a **schema change** — the field-level unique index is dropped and a compound index created. On SQL adapters this appears in a generated migration and must be reviewed: if the existing data violates the new constraint the migration fails, which is the correct outcome but needs saying. The README documents the sequence.

A consumer replacing a hand-written compound index with `{ with: [...] }` may generate a migration that drops and recreates an identical index under a different name. Harmless, but noted so it is not mistaken for drift.

## Dev app demonstration

**`dev_multi_tenant`** — `src/collections/pages.ts` sets `slug: { unique: { with: ['tenant'] } }`, and the seed creates two tenants that both own a page with slug `about`. Both save; each resolves to the right document through `findPageByPath` with the tenant's `baseFilter`; creating a _second_ `about` inside one tenant is rejected. `src/payload.config.ts` collapses its two filter callbacks into a single `baseFilter` reading `doc` when present.

**`dev`** — `src/collections/country-travel-tips.ts` sets `slug: { unique: { with: ['parent'] } }` (subject to the polymorphic spike), and the seed creates two travel tips sharing a slug under different countries. Both save and both resolve; a duplicate under the _same_ parent is rejected.

Both are clickable: create the duplicate in the admin panel and watch it succeed or fail depending on the partition.

## Tests

Failing tests land first, per `CLAUDE.md`.

**`dev_multi_tenant/plugin.test.ts`**

- Two tenants both persist a page with slug `about`; each resolves to its own document through `findPageByPath`. This fails today.
- A second `about` within one tenant is rejected by the database constraint, not merely by a hook.
- A single `baseFilter` reading `doc` scopes redirect validation: the same `sourcePath` is accepted in two tenants and rejected twice within one.
- An install that still sets `redirectValidationFilter` keeps its behaviour, and it takes precedence over `baseFilter`'s `doc` branch.

**`dev/plugin.test.ts`**

- Two documents share a slug under different parents and both resolve to distinct paths; a duplicate under the same parent is rejected. Subject to the polymorphic spike.
- `unique: true` still rejects a collection-wide duplicate — the default is untouched.
- `unique: { with: ['nonexistentField'] }` throws at init, naming the collection and the field.
- `unique: { with: [] }` throws at init.

**`test/`** (unit) — the documented normalization rules match `formatSlug`'s output for a table of inputs covering case, non-ASCII characters, punctuation, and leading/trailing/repeated separators. This pins the README against the implementation, so the two cannot drift.

## Non-goals

- **No `scope` concept.** A plugin-level `{ field, resolve }` partition was considered and rejected: it is strictly narrower than `baseFilter` (single-field equality only), and its one irreducible advantage — knowing a field name at config time — is exactly what `slug.unique.with` provides per collection, where both the tenant and the parent dimension actually live.
- **No removal of `redirectValidationFilter`.** Deprecated here, removed at 1.0.
- **No automatic index for `unique: true`.** The field-level unique index stays as-is; only the object form changes mechanism.
- **No cross-collection uniqueness.** Two documents in different collections can already produce the same path; collisions stay resolved by scan order.
- **No parent-scoped uniqueness in `validateSlug`.** The hook-level check is not extended to mirror the index. The database constraint is the guarantee; duplicating it in a hook creates two sources of truth that drift.

## Semver

`feat(pages)`, minor bump. Additive; no `!` marker. Two `CHANGELOG.md` lines: `slug.unique` accepts a field list to scope uniqueness, and `baseFilter` receives the document during redirect validation (deprecating `redirectValidationFilter`).
