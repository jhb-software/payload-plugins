# Changelog

## Unreleased

- feat: add **experimental** `listPagePaths`, which enumerates every live path across the plugin's page collections (published, not trashed, scoped by `baseFilter`) — one entry per document and locale, carrying the breadcrumb label and `updatedAt`, as the data source for a sitemap or llms.txt
- feat: add **experimental** `pathChanges`, a helper for a page collection's own `afterChange`/`afterDelete` hooks which reports the live paths the write started or stopped resolving (`previousPath` → `path`), including every descendant whose path moved with a renamed or moved ancestor — draft saves report nothing, and a rename staged in a draft is reported on publish with the previously published path
- feat: export **experimental** `isPageCollectionConfig`, the predicate for identifying page collections on the raw config at config-build time

- fix: redirect validation, the parent deletion guard and the `sharedDocument` parent default now run inside the caller's transaction instead of on a separate connection. Writes batched into one transaction are no longer invisible to them: deleting a parent whose only child was created in the same transaction is refused, a duplicate redirect is refused, and the shared parent default finds a sibling created alongside it.
- feat: `page.parent.collection` accepts a list of collection slugs, so a collection can nest under itself and under other page collections at the same time (`/shop` → `/shop/mens` → `/shop/mens/shirts`). A single slug keeps the previous field type, storage and value shape, so existing installs need no migration; opting a collection into a list is a storage change and the README documents the recipe per adapter. A parent value which does not name its collection — what an unmigrated row looks like — is refused with a validation error instead of being treated as no parent.
- **BREAKING**: a `page.parent.collection` naming a collection which is not a page collection now throws at startup instead of failing later with a confusing breadcrumb error. A collection using `parent.sharedDocument` may no longer list its own slug. Both indicate a config that could never produce a valid page tree.
- **BREAKING**: the parent deletion guard now also applies to the trash. Moving a parent that is referenced by child documents to the trash is refused, where it previously succeeded and left the children without a computed `path` and `breadcrumbs`. Collections without `trash: true` are unaffected; restoring a document is never blocked.
- **BREAKING**: trashed children now count towards the parent deletion guard, because they carry a live parent id until they are permanently deleted. A parent whose children are all trashed can no longer be permanently deleted — restore or reassign those children first. The exported `childDocumentsOf` / `hasChildDocuments` include trashed children accordingly, and now propagate a query failure instead of logging a warning and reporting no children.
- feat: export `SKIP_PARENT_GUARD_CONTEXT_KEY`, a request context flag which disables the parent deletion and trash guards for the request it is set on (`payload.delete({ ..., context: { [SKIP_PARENT_GUARD_CONTEXT_KEY]: true } })`). Intended for a teardown which removes a whole subtree, where no child can be orphaned.
- feat: the generated fields (`slug`, `parent`, `path`, `breadcrumbs`, `isRootPage`) accept an `admin` override in the matching `page` block, and `page.parent` additionally a `filterOptions`. Both `admin.condition` and `filterOptions` are ANDed with the plugin's, so an override narrows rather than replaces (see the README).
- perf: virtual path/breadcrumb generation reads ancestors directly from the database adapter in batched per-level queries instead of one Local API call per ancestor — ancestor collections' `afterRead` hooks no longer run during the walk, and a dangling ancestor reference deeper than the direct parent (possible on MongoDB) now logs an error and returns the document without virtual fields instead of a wrong, shorter path
- fix: a `select` no longer returns the raw fields (`slug`, the parent field, `isRootPage` and the breadcrumb label field) which are only selected internally to compute the virtual fields — responses now contain exactly the fields the caller requested. Select such a field explicitly if a response is expected to contain it.
- fix: the `slug` field is now read only on a trashed document and on a document locked by another user, instead of staying editable while every other field is frozen.
- fix: a `create` or `update` passing a `select` which asks for none of the virtual fields now hands `afterChange` hooks a document with correct `path` and `breadcrumbs` — previously the select stripped the fields the computation reads before the hooks ran. Virtual fields a mutation's `select` did not ask for are no longer returned.

## 0.9.0-beta.1

- feat: add `waitUntil` and `onCacheResult` arguments to `findPageByPath` — defer cache maintenance writes off the critical path (e.g. via `waitUntil` from `@vercel/functions` or Cloudflare's `ctx.waitUntil`) and observe the cache lookup status (`hit` / `stale` / `miss`)

## 0.9.0-beta.0

- feat: add **experimental** `findPageByPath`, which resolves a path to its page document across all page collections, scoped by the plugin's `baseFilter` (e.g. multi-tenant), with a self-verifying KV path cache covering both published and draft lookups (toggle per call via the `cache` argument, resettable via `clearPathCache`). The API may still change while it is stabilized.
- feat: export `formatSlug`, the slug normalizer the slug field validates against

## 0.8.0

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16
- fix: respect a user-customized `routes.api` when `getBreadcrumbs` is called from client-side field components. `getBreadcrumbs` now takes an optional `apiURL` argument (required when called without a `req`) that the `PathField` supplies from `useConfig()`. The internal `fetchRestApi` helper has been removed and inlined.
- fix: restore proper icon sizes for the slug sync button and the slug-change info banner after the Geist icon standardization

## 0.7.0

- feat: add request-scoped ancestor caching to avoid redundant DB queries when computing virtual fields for sibling pages
- feat: pass full req to payload.findByID in getBreadcrumbs
- fix: populate virtual fields (`path`, `breadcrumbs`) on `previousDoc` in the `afterChange` hook, and run the plugin's hook before user-defined hooks so that `doc` also contains the virtual fields
- fix: gracefully handle errors when computing virtual fields (e.g. when a parent document no longer exists) instead of crashing the operation
- fix: use overrideAccess for parent document fetches in breadcrumb generation
- fix: prevent circular parent references
- fix: only set alternatePaths on previousDoc meta instead of copying entire meta
- fix: pass draft arg to parent document lookups in breadcrumb generation
- style: standardize icons to use Geist icon set (16x16 filled)
- refactor: use i18next interpolation for translations
- fix type issue in the `afterChange` virtual-fields hook
- chore: upgrade to Payload 3.84.1

## 0.6.0

> ⚠️ **Warning**: This release includes breaking changes.

- feat!: add new collection config creation approach using `PageCollectionConfig` and `RedirectsCollectionConfig` types instead of `createPageCollectionConfig` and `createRedirectsCollectionConfig` functions.
- feat!: a `generatePageURL` function needs to be defined in the plugin config. See the [README](./README.md#setup) for more information.
- feat!: the plugin now uses Payload's build-in preview button instead of a custom one. Preview and live preview are automatically enabled. To opt out, set the `preview` and `livePreview` options to `false` in the page collection config.
- feat: add support for multi-tenant setups via the official [Multi-tenant plugin](https://payloadcms.com/docs/plugins/multi-tenant). See the [README](./README.md#multi-tenant-support) for more information.
- feat: add a redirect creation and discard button to the 'changed slug' warning banner below the slug field.
- feat: add discard and redirect creation button to slug change banner
- fix: pass transasction id to find operations in generate virtual fields hook

### Migration Guide

**Creating a page/redirects collection [Before]:**

```ts
import { createPageCollectionConfig } from '@jhb.software/payload-pages-plugin'

const Pages: CollectionConfig = createPageCollectionConfig({
  slug: 'pages',
  page: {/* config */},
  fields: [/* fields */],
})

const Redirects = createRedirectsCollectionConfig({/* config */})
```

**Creating a page/redirects collection [After]:**

```ts
import { PageCollectionConfig, RedirectsCollectionConfig } from '@jhb.software/payload-pages-plugin'

const Pages: PageCollectionConfig = {
  slug: 'pages',
  page: { /* config */ },
  fields: [/* fields */],
}

const Redirects: RedirectsCollectionConfig = {
  slug: 'redirects',
  redirects: {},
  fields: [],
  { /* config */ }
}
```

**Initializing the plugin [Before]:**

```ts
import { payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'

payloadPagesPlugin({/* config */})
```

**Initializing the plugin [After]:**

```ts
import { payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'

payloadPagesPlugin({
  // Example generatePageURL function:
  generatePageURL: ({ path, preview }) =>
    path && process.env.NEXT_PUBLIC_FRONTEND_URL
      ? `${process.env.NEXT_PUBLIC_FRONTEND_URL}${preview ? '/preview' : ''}${path}`
      : null,
  /* config */
})
```

Ensure to run `payload generate:importmap` after the migration to generate the new import map.

## 0.5.1

- fix: ensure compatibility with sqlite db adapter (4a2efdc)

## 0.5.0

- feat: add support for unlocalized page collections (de138bc)
- feat: add admin panel i18n support (EN, DE) (9c4f55d)
- feat: allow version config to be passed to redirects collection config (652bc9e)
- feat: add custom breadcrumb field component which displays breadcrumbs in modal (cd58475)
- feat!: remove auto fixing of invalid/missing slug (f0a8531)
- fix: append "-copy" to path when duplicating redirects (33be9aa)
- fix: resolve issue with not selected fields in sub-queries (c333598)
- fix: do not show slug redirect warning when draft document is published (7765706)
- fix: ensure title field hooks are not overridden (f8c48a0)
- fix: correct field hooks to use the correct field value (f6a41df)
- fix: update slug and isRootPage field when duplicating the root page (f6db809)

## 0.4.1

- fix: resolve issue with not selected fields in sub-queries (c333598)

## 0.4.0

- add validation to the slug field
- BREAKING: when using the `slugField` function in non-page collections
  - the previously optional `fallbackField` option is now required
  - the `redirectWarning` option is now removed

## 0.3.1

- localize the array breadcrumbs field itself for consistency with virtual field data (20cefed)

## 0.3.0

- BREAKING: feat: add new unique and static slug options to page config (a51a47d)
- BREAKING: refactor: restructure page config schema (7c30f8d)

## 0.2.1

- fix: set virtual fields after change (1df18f1)
- refactor: make function parameter types more concrete (832ce18)

## 0.2.0

Initial experimental release.
