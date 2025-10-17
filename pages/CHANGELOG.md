# Changelog

## 0.6.0 (Unreleased)

- feat!: add new collection config creation approach using `PageCollectionConfig` and `RedirectsCollectionConfig` types instead of `createPageCollectionConfig` and `createRedirectsCollectionConfig` functions.
- feat!: the plugin config now requires a `generatePageURL` function to be defined. See the [README](./README.md#setup) for more information.
- The plugin now uses the build-in Preview Button instead of a custom one.
- feat: add support for multi-tenant setups via the official [Multi-tenant plugin](https://payloadcms.com/docs/plugins/multi-tenant). See the [README](./README.md#multi-tenant-support) for more information.


### Migration Guide

**Old approach:**
```ts
import { createPageCollectionConfig, createRedirectsCollectionConfig } from '@jhb.software/payload-pages-plugin'

const Pages: CollectionConfig = createPageCollectionConfig({
  slug: 'pages',
  page: { /* config */ },
  fields: [/* fields */],
})

const Redirects = createRedirectsCollectionConfig({})
```

**New approach:**
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
}
```

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
