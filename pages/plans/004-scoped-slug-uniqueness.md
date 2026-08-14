---
title: Scoped slug uniqueness and one partition filter
description: `slug.unique` is a collection-wide constraint, which is wrong the moment documents are partitioned by tenant or nested under different parents. Widen it to name the fields it is unique *with*, and fold `redirectValidationFilter` into `baseFilter` so the partition is expressed once.
type: feature
readiness: blocked
---

## Problem

### Collection-wide slug uniqueness is the wrong default twice over

`slugField` defaults to `unique: true` (`fields/slugField.ts:31`), applied through `pageSlugField` at `collections/PageCollectionConfig.ts:110-115` from `page.slug.unique` (`types/PageCollectionConfigAttributes.ts:99`). It emits a field-level unique index across the whole collection.

That is correct only for a flat, single-partition collection. Two situations break it, and both are ordinary:

**Partitioned documents.** When a collection is scoped by a tenant, site, workspace or brand field, two partitions both want `/about`. The collection-wide index forbids it. The only escape today is `slug: { unique: false }` plus a hand-written compound index in the collection config — repeated once per page collection, and silently omitted by anyone who does not think of it, who then ships with no uniqueness guarantee at all.

**Nested documents.** Plan 001 (PR #193, not merged) records this as an explicit non-goal: with self-nesting collections, `/shop/mens/shirts` and `/shop/womens/shirts` are two documents sharing the slug `shirts` under different parents. Collection-wide uniqueness forbids the second. The same escape hatch applies, with the same cost.

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

The incoming and processed types widen to `boolean | { with: string[] }` (`types/PageCollectionConfigAttributes.ts:99,138`). `true` and `false` behave exactly as today, so no existing install changes.

`{ with: [...] }` sets the slug field's own `unique` to `false` and adds a collection-level compound index instead:

```ts
indexes: [
  ...(incomingCollectionConfig.indexes ?? []),
  { fields: ['slug', ...pageConfig.slug.unique.with], unique: true },
]
```

Payload supports collection-level compound indexes (`payload/dist/collections/config/types.d.ts:573`). The plugin composes with any the consumer already declared rather than replacing them.

Validation at init, throwing and naming the collection: every field in `with` must exist on the collection, and `with` must be non-empty. A typo'd field name would otherwise produce either a broken index or none. Core's `sanitizeCompoundIndexes` already throws `Field <path> was not found`, but without naming the collection, which is the part worth adding.

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

## Spikes

Run against `payload@3.87.1` with fixtures on the SQLite adapter. A third
blocker surfaced that was not anticipated, and it is decisive — see below.

### 0. The slug field is localized, and that blocks the mechanism (blocker)

Not in the original spike list, and it invalidates the proposal as written.

`pageSlugField` sets `localized: true` unconditionally (`fields/slugField.ts:62`).
Neither a tenant field nor `parentField` is localized. A compound index therefore
mixes a localized and a non-localized field, and the two adapters diverge:

- **SQL.** `@payloadcms/drizzle` throws at startup when a compound index mixes the
  two, because a localized column lives in the `_locales` table and a
  non-localized one in the root table — one index cannot span both:

  > `Compound indexes within localized and non localized fields are not supported in SQL. Expected tenant to be non localized.`

  Reproduced with a two-locale config and `indexes: [{ fields: ['slug', 'tenant'], unique: true }]`.
  The same index with a non-localized `slug` builds without error, which is why the
  hand-written index in `dev_multi_tenant` works today — that app sets `localization: false`.

- **MongoDB.** No throw, but the semantics are wrong. A localized path expands into
  one key per locale, producing a single index `{ 'slug.de': 1, 'slug.en': 1, tenant: 1 }`
  over the whole locale tuple. Two documents in one tenant with
  `{de: 'about', en: 'about'}` and `{de: 'about', en: 'other'}` differ in that tuple, so both
  save — a duplicate German slug is accepted. That is weaker than today's field-level
  `unique: true`, which mongoose builds as a separate unique index per locale path.

So `with: [...]` delivers the intended guarantee only when localization is off. That
covers `dev_multi_tenant` and `dev_unlocalized` and excludes `dev`, the localized
flagship configuration. No choice of `with` fields avoids this: the constraint is that
every field in the index must match `slug`'s localization, and localizing `parent` or
`tenant` to satisfy it is a far larger semantic change than this plan contemplates.

Restricting the object form to non-localized installs is expressible (throw at init
naming the collection), but it makes the feature unavailable exactly where the
plugin is most used. Reopening the "no parent-scoped uniqueness in `validateSlug`"
non-goal is the alternative: where the database cannot express the constraint, the
choice is a hook-level check or no guarantee at all, not two sources of truth.

**This needs a decision before implementation.**

### 1. Can a compound index target a polymorphic parent? — not applicable yet

Plan 001 is not merged (PR #193 is still plan-only), so `page.parent.collection` is a
single `CollectionSlug` today and `parentField` emits a plain single relationship. On
SQL that is a `parent_id` column on the root table and indexable; on MongoDB an
ObjectId path. So `with: ['parent']` is representable **in the non-localized case** —
but is blocked by spike 0 in the localized case, which is where nested documents
actually live. Re-run this spike if #193 lands and `parent` becomes polymorphic.

### 2. Do trashed rows break the constraint? — yes, confirmed

Reproduced in `dev_multi_tenant` against its existing `(slug, tenant)` unique index:
create a page, set `deletedAt`, then create a new page with the same slug in the same
tenant. The second create fails with `The following field is invalid: slug`. The
plugin has no hook-level uniqueness check, so the error comes from the database
index. An editor recreating a page they just trashed hits an error about a document
they cannot see.

`CompoundIndex` is `{ fields: string[]; unique?: boolean }` — no `where`
(`payload/dist/collections/config/types.d.ts:731`), so a partial index
(`WHERE deleted_at IS NULL`) is not expressible. Adding `deletedAt` to the tuple does
not give usable semantics either: `deletedAt` is a timestamp, so every trashed row
gets a distinct value and the constraint stops applying to trashed rows entirely —
but it also stops applying between two rows trashed at different instants, which is
the intended effect, while live rows all share `NULL` and stay constrained. On SQL
that works; on MongoDB, `null` values compare equal in a unique index, so live rows
stay constrained there too. Worth pinning with a test if this route is taken, since
it depends on adapter-specific null handling. Otherwise document the limitation.

Note this limitation exists **today** for anyone using the hand-written workaround,
so it is not a regression introduced by this plan.

## Consequences

Additive. Existing installs set `unique: true` or `unique: false` and see no change; the new object form is opt-in per collection.

Adopting `{ with: [...] }` on an existing collection is a **schema change** — the field-level unique index is dropped and a compound index created. On SQL adapters this appears in a generated migration and must be reviewed: if the existing data violates the new constraint the migration fails, which is the correct outcome but needs saying. The README documents the sequence.

A consumer replacing a hand-written compound index with `{ with: [...] }` may generate a migration that drops and recreates an identical index under a different name. Harmless, but noted so it is not mistaken for drift.

## Dev app demonstration

**`dev_multi_tenant`** — `src/collections/pages.ts` replaces its existing `slug: { unique: false }` plus hand-written `indexes: [{ fields: ['slug', 'tenant'], unique: true }]` with `slug: { unique: { with: ['tenant'] } }` — a straight swap of the workaround for the supported form. The seed creates two tenants that both own a page with slug `about`. Both save; each resolves to the right document through `findPageByPath` with the tenant's `baseFilter`; creating a _second_ `about` inside one tenant is rejected. `src/payload.config.ts` collapses its two filter callbacks into a single `baseFilter` reading `doc` when present. This app sets `localization: false`, so it is unaffected by spike 0.

**`dev`** — blocked by spike 0: this app is localized, so no compound index over `slug` builds on SQL. The intended demo was `src/collections/country-travel-tips.ts`, whose parent field is named `country` (not `parent`), so the form would be `slug: { unique: { with: ['country'] } }`. Note that collection also sets `slug.staticValue`, so every document already shares one slug and the scoped constraint is the only thing that could make it valid — which makes it a good demo, but only once spike 0 is resolved.

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
