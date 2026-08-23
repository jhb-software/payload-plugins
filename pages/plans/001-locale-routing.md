---
status: proposed
---

# Locale routing: per-request prefix strategy, per-locale liveness

Design for multi-tenant localized installs that need per-tenant locale prefixing and
per-locale publish state. Line references are the current `main`
(`0.9.0-beta.2`).

## Summary

One new plugin option, `localeRouting`, decides **per request** which locale is the
site's primary one and whether that locale is served with or without a `/<locale>`
prefix. The decision is resolved once per request, cached on `req.context`, and
threaded through every place that mints or parses a locale prefix — path generation,
`findPageByPath`, `listPagePaths`, `pathChanges`, the admin path preview, the KV cache
key, and `alternatePaths` (`x-default`). Liveness becomes locale-aware so that a
localized `_status` (Payload `localizeStatus`, unconditional in v4) resolves each
locale's path independently. Locale codes become reserved slugs on localized installs.

Without the option nothing changes: every locale stays prefixed, no `x-default`,
identical cache keys apart from a one-time miss while the routing segment is new.

## Public API

### `localeRouting` plugin option

```ts
export type LocaleRouting = {
  /**
   * The site's primary locale. Must be one of `localization.localeCodes`.
   * Emitted as `x-default` in `alternatePaths`, and used as the locale of an
   * unprefixed path in `findPageByPath` when no `locale` argument is given.
   * Independent of Payload's `localization.defaultLocale`, which stays a storage
   * and fallback concern.
   */
  primaryLocale: Locale
  /**
   * Whether the primary locale's paths carry the `/<locale>` prefix.
   * `false` serves the primary locale at `/kontakt` and every other locale at
   * `/<locale>/kontakt`.
   * @default true
   */
  prefixPrimaryLocale?: boolean
}

export type PagesPluginConfig = {
  // ...existing options
  /**
   * Locale routing for localized installs. A static value applies to the whole
   * install; a function is evaluated once per request (result cached on
   * `req.context`) so it can derive the routing from the request — e.g. from the
   * tenant — without a per-document cost. Return `undefined` for the default
   * (every locale prefixed, no `x-default`).
   * Ignored when Payload localization is disabled.
   */
  localeRouting?:
    | LocaleRouting
    | ((args: {
        req: PayloadRequest
      }) => LocaleRouting | undefined | Promise<LocaleRouting | undefined>)
}
```

Why a `primaryLocale` + boolean rather than just `unprefixedLocale`: `x-default` is needed
for every tenant, including ones that prefix all locales. The primary locale
is the single concept both features hang off; the boolean is the only remaining degree
of freedom. A general `localePrefix(locale) => string` mapper was rejected — it doubles
the resolution surface in `findPageByPath` (ambiguous empty prefixes, custom prefix
inversion) for a use case nobody has asked for. Domain-per-locale (no prefix anywhere) is
deliberately not modelled; it would need host-aware resolution, host-aware
`alternatePaths` and a locale on redirects, and the boolean can become an enum if that
ever lands.

Why `{ req }` only, and no `doc`: path computation runs per document (a `find` of 50 pages,
a sitemap of documents × locales), so the
decision must not be per document. Taking `req` alone makes once-per-request caching a
guarantee of the API rather than a convention. A resolver that needs a tenant record
does one lookup per request (`dev_multi_tenant` shows this); the plugin never calls it
again within that request.

Multi-tenant usage:

```ts
payloadPagesPlugin({
  baseFilter: ({ req }) => ({ tenant: { equals: tenantIdFrom(req) } }),
  localeRouting: async ({ req }) => {
    const tenant = await loadTenant(req) // once per request
    return (
      tenant && {
        primaryLocale: tenant.primaryLocale,
        prefixPrimaryLocale: !tenant.prefixAllLocales,
      }
    )
  },
})
```

### Path shape

| install                       | routing                                               | `de` (primary)            | `en`                      |
| ----------------------------- | ----------------------------------------------------- | ------------------------- | ------------------------- |
| localized, no routing (today) | —                                                     | `/de/kontakt`, root `/de` | `/en/contact`, root `/en` |
| localized                     | `{ primaryLocale: 'de' }`                             | `/de/kontakt`, root `/de` | `/en/contact`, root `/en` |
| localized                     | `{ primaryLocale: 'de', prefixPrimaryLocale: false }` | `/kontakt`, root `/`      | `/en/contact`, root `/en` |
| unlocalized                   | ignored                                               | `/kontakt`, root `/`      | —                         |

### `findPageByPath` resolution

With routing resolved for the request (`R`), path `p = /s0/s1/...`:

1. `locale = args.locale` if given.
2. If `s0` is a locale code **and** `s0` is a prefixed locale under `R` (i.e. not
   `R.primaryLocale` with `prefixPrimaryLocale: false`): strip it, `locale ??= s0`.
3. Otherwise: `locale ??= R?.primaryLocale ?? localization.defaultLocale` — with routing
   configured, the primary locale is always the inference fallback, matching the
   `primaryLocale` doc comment. With the primary locale prefixed an unprefixed path fails
   the byte comparison anyway, so the fallback only matters for `prefixPrimaryLocale: false`.

The stripping test now depends on `R`, not only on membership in `localeCodes` — this is
the fix for `findPageByPath.ts:74`. An explicit `locale` argument
still wins for the query locale. `/de/kontakt` on a tenant that serves `de` unprefixed
is a 404 (slug `de` is reserved, see below), which is the correct answer: that URL does
not exist on that tenant.

### Reserved slugs

On localized installs `slugField`'s `validate` rejects any slug equal to a configured
locale code (`req.payload.config.localization.localeCodes`), with a translated message.
Applies regardless of routing — the rule must hold for every tenant because routing is
per request and documents do not move between tenants, and a static rule is explainable
in one sentence. Only segment 0 is actually ambiguous, but "a slug is never a locale code"
is stable across re-parenting and needs no positional reasoning. **BREAKING** in the narrow
sense that an existing page slugged e.g. `en` fails validation on its next save; no data
migration, and until such a page is re-saved the `findPageByPath` ambiguity described above
still applies to it. Ships with the `!` marker and a minor bump (pre-1.0).

### `alternatePaths`

Shape stays `{ hreflang: Locale | 'x-default'; path: string }[]`. When routing resolves a
`primaryLocale` and that locale has a path, one `{ hreflang: 'x-default', path }` entry is
appended. Unchanged when no routing.

`alternatePaths` stays inside the SEO `meta` group — the plugin does not add a field of
its own. `alternatePathsField()` is already exported; the README's new Localization section
documents adding it to the SEO plugin's `fields` so the value is typed and selectable,
without introducing a second location for the same data.

### Liveness with a localized `_status`

Detection: `hasLocalizeStatusEnabled(collection)` from `payload/shared` (reads
`versions.drafts.localizeStatus` on the sanitized config; set by the experimental flag on
3.72–3.x, unconditional in v4). The plugin's own `hasDraftsEnabled` copy in `liveness.ts`
is replaced by Payload's export of the same name. The query shape below mirrors Payload's
`replaceWithDraftIfAvailable`, which already issues `_status.<locale>` / `or` over
`localeCodes` against every adapter.

- `livenessConditions(collection, locale)`: localized status + specific locale →
  `{ [`_status.${locale}`]: { equals: 'published' } }` (explicit key, independent of
  the request locale); localized status + `'all'` → `or` over all locale codes, callers
  then filter per locale; non-localized → unchanged.
- `isLiveRow(row, collection, locale)`: reads `row._status?.[locale]` when localized.
- `DocPaths.live: boolean` → `live: Record<string, boolean>` keyed like `paths` (`''`
  on unlocalized). Internal type; `pathChanges` output is already per locale and its
  `path: null` when not live semantics are unchanged.
- `listPagePaths` under `'all'` checks `doc._status[locale]` per entry.
- `isVersionOnlyWrite` (`pathIndex.ts:286`) also reads `doc._status`; with a localized
  status a write is version-only when no locale's status is `'published'`.

A locale's path resolves when that locale is published; `en` live and `de` draft on the
same document yields exactly one entry and one resolvable path.

### KV cache key

`payload-pages:path:v1:<status>:<locale>:<routing>:<scopeHash>:<path>` where `routing`
is `-` (none) or `<primaryLocale>[!]` (`!` = unprefixed). Routing is a request-level
input to the path, so it must be in the key even when `baseFilter` is unset. No version
bump: old-shape keys can never equal new ones (both new segments are non-empty and `path`
starts with `/`), a hit would be self-verified anyway, and staying on `v1` keeps the
orphaned entries inside `clearPathCache`'s sweep.

### Redirects

`pathChanges` is already per (document, locale) and is the server-side source for
automatic redirects. The admin "create redirect" banner (`SlugFieldClient`) already
emits one redirect for the active locale only; it must build both paths with the resolved
routing (see admin below). No change to the redirects collection — paths are stored
fully qualified.

## Internal design

New module `src/utils/localeRouting.ts`:

```ts
resolveLocaleRouting(req, pluginConfig): Promise<LocaleRouting | undefined>
  // cached on req.context['pagesPluginLocaleRouting']; throws when primaryLocale ∉ localeCodes
  // (a typo would silently rewrite every path of a tenant)
localePathPrefix(locale: Locale | undefined, routing): ''|`/${locale}`
isPrefixedLocale(locale, routing): boolean
localeRoutingCacheToken(routing): string
```

`pathFromBreadcrumbs({ breadcrumbs, additionalSlug, locale, routing })` — the prefix is
computed via `localePathPrefix`. Thread `routing` through the five remaining sites listed
in the survey (`getBreadcrumbs.ts:44,156,168`, `setRootPageVirtualFields.ts:36,80`,
`computeDocPaths.ts:105` `rootPagePaths`). Callers that have a collection config reach
`pluginConfig` via `collection.custom.pagesPluginConfig` (existing channel):
`setVirtualFields` hooks, `computeDocPaths`, `loadDescendants`, `findPageByPath`,
`pathIndex`.

Known limitation (README): routing is a function of the request, never of the document.
In the admin, a user who sees documents of several tenants at once (e.g. a super-admin
with no tenant cookie, or the list view across tenants) sees every `path` computed under
the _request's_ routing, and `listPagePaths` indexes one tenant per call. This is the
price of the no-per-document-cost constraint and is by design.

Admin: `PathField` and `SlugFieldClient` are client components without `req`. Wrap each
in a server field component that calls `resolveLocaleRouting(req, pluginConfig)` and
passes `localePrefixes: Record<Locale, string>` as a prop; the client joins with the
prefix instead of `/${locale}`. (`PathField.tsx:102,115,167,202`, `SlugFieldClient.tsx:75,82`.)

`findPageByPath` without `args.req` and a **function** `localeRouting` throws, with the same
message shape as the existing `baseFilter` guard (`findPageByPath.ts:98-105`): a
request-dependent resolver cannot be evaluated without a request, and silently falling back
to default routing would turn `/kontakt` on an unprefixed-`de` tenant into an unexplained
`null`. A static `LocaleRouting` object keeps working without `req`.

## Tests (integration, both adapters)

- Generation/resolution symmetry: for each routing variant, every `listPagePaths` entry
  resolves via `findPageByPath` to its own document, and root pages resolve at `/` vs
  `/de`.
- Unprefixed primary: `/kontakt` → de page; `/en/contact` → en page; `/de/kontakt` →
  null; `findPageByPath('/')` → de root.
- Explicit `locale` argument on an unprefixed path wins over inference.
- Per-tenant routing: two tenants in one install, different `primaryLocale`/prefixing,
  same slug resolves to different paths per tenant request; the resolver is called once
  per request across a 50-document `find`.
- Slug validation rejects a locale code on a localized install and accepts it on an
  unlocalized one.
- `x-default` present only when routing resolves.
- Localized `_status`: publish only `en`; `en` path resolves, `de` path is null in
  `listPagePaths`/`findPageByPath`, `pathChanges` reports only `en` when `en`'s slug
  changes.
- KV key differs across routings for the same path.
- Unit: `localePathPrefix`, `findPageByPath` segment parsing table.

## Dev app demonstration

`dev_multi_tenant/` becomes localized (`locales: ['de','en']`, `defaultLocale: 'en'`),
enables `experimental.localizeStatus` + `versions.drafts.localizeStatus: true` on Pages,
and the `tenants` collection gets `primaryLocale` (select) and `prefixAllLocales`
(checkbox). The plugin invocation adds:

```ts
localeRouting: async ({ req }) => {
  const tenantId = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)
  if (!tenantId) return undefined
  const tenant = await req.payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, req })
  return { primaryLocale: tenant.primaryLocale, prefixPrimaryLocale: !tenant.prefixAllLocales }
}
```

Seed two tenants (one `de` unprefixed, one all-prefixed) so the path preview, the
redirect banner, `/api/resolve-page`, and the sitemap-style `listPagePaths` output can be
compared by switching the tenant cookie. `dev/` stays all-prefixed and unchanged as the
backward-compatibility reference.

## Changelog (Unreleased)

- feat(pages): `localeRouting` option — per-request primary locale, optional unprefixed
  primary locale, `x-default` in `alternatePaths`
- feat(pages): per-locale liveness with a localized `_status` (`localizeStatus`)
- **BREAKING**: locale codes are rejected as slugs on localized installs

## Out of scope

Automatic server-side redirect creation (consumers can build it on `pathChanges`);
per-document routing; custom prefix strings.
