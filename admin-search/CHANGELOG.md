# Changelog

## Unreleased

- feat: add a `baseFilter` option restricting search results to a constraint resolved against the current request, e.g. the tenant selected in a multi-tenant admin panel. A filter that cannot be evaluated is logged and the search returns no results, rather than widening to the documents the filter was meant to hide
- fix: the result list shown before anything is typed now honours the same five-result limit as a typed search, instead of listing ten
- **BREAKING**: the header component moved from `@jhb.software/payload-admin-search/client#SearchWrapper` to `@jhb.software/payload-admin-search/rsc#SearchWrapper`, and `/client` now provides `SearchWrapperClient` in its place. **Run `payload generate:importmap` after upgrading**, otherwise the search disappears from the admin header.

## 0.3.0

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16
- refactor: use i18next interpolation for translations

## 0.2.1

- fix: use collection label instead of slug in document search result

## 0.2.0

- feat: add support for searching collections and globals
- feat: add i18n support (with English and German translations)
- feat: improve UI and UX of the search modal
- fix: resolve CSS naming conflicts with the Payload UI

## 0.1.0

Initial experimental release.
