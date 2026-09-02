# Changelog

## Unreleased

- feat: add `healthCheck.baseFilter`, a `({ collection, req }) => Where` narrowing what the health report counts — in a multi-tenant CMS, to the tenant the request is for. Resolved per collection, so collections without the constraining field can return `{}`. The scan's cache key is derived from the resolved filters, so one scope's counts are never served to another.
- **BREAKING**: `healthCheck` no longer accepts a function. Move the access check to `healthCheck: { access: ({ req }) => ... }`; the function form now throws at config load. `healthCheck: true` / `false` are unchanged.
- feat: add `createVisionResolver`, a factory that owns the prompt, the per-locale response schema, the optional image download and the strict reading of the response, so a resolver for another LLM provider is only its provider call. Both bundled resolvers are built on it.
- feat: add an `instructions` option to `openAIResolver` and `mistralResolver`, receiving the default instructions so a house style rule can be appended without restating them
- feat: add a `timeoutMs` option to `openAIResolver`. Omitted by default, leaving the OpenAI client's own deadline and retries in charge.
- fix: `openAIResolver` rejects a blank alt text and a response missing one of the requested locales instead of writing it to the document, and reports a missing API key before spending a request. It now asks for a locale-keyed response for a single locale too, so generated wording may differ slightly from previous versions.
- fix: a provider that ran out of tokens mid-JSON is reported as such instead of `Unexpected end of JSON input`, and a single-locale generation no longer gets half the token budget of a multi-locale one
- fix: `mistralResolver` falls back to the collection's `imageThumbnailMimeType` when the thumbnail host serves no `content-type` or a generic `application/octet-stream`, instead of rejecting the image as unreadable. With nothing declared either, the error names what was served and points at that option.

## 0.10.0

- feat: add `mistralResolver`, a resolver for Mistral's vision models (default `mistral-medium-latest`). It downloads the image and sends the bytes instead of passing the thumbnail URL to the provider: Mistral's fetcher requires a publicly reachable file — never true in local development, not true for private buckets — and some hosts refuse it with `File could not be fetched from url` (error 3310). All requested locales are generated in a single request.
- feat: add the `imageThumbnailMimeType` option (plugin-wide or per collection, `null` to opt out) declaring the format `getImageThumbnail` delivers. A resolver only sees the bytes at that URL, so a transcoding thumbnail (e.g. a Cloudinary `f_webp` transformation) no longer has AVIF and HEIC uploads rejected on their stored format. The declaration is validated at config load, so a wrong one fails at boot rather than per image, and is passed to resolvers as `imageThumbnailMimeType` for providers that inline the image bytes and need an explicit media type.
- feat: `getImageThumbnail` receives `{ collection, req }` as a second argument and may be async, for per-collection URLs and on-demand signing. Existing sync single-argument functions are unaffected.
- feat: add a `supportedMimeTypes` option to `openAIResolver`, so a `baseUrl` pointing at another OpenAI-compatible provider can declare the formats it accepts instead of inheriting OpenAI's list.
- fix: defer the alt text health cache invalidation via `after()` so `payload.create` / `payload.update` invoked from `onInit` (or any other render-time path) no longer crash with `revalidateTag … during render`; requires Next.js `>= 15.1`, where `after()` is stable (peer dependency narrowed from `^15.0.0`)

## 0.9.1

- fix: also export `getAltTextHealth` from the package root. Importing it from `/server` pulled the admin widget's `@payloadcms/ui` styles into the config graph and crashed `payload generate:*` (`ERR_UNKNOWN_FILE_EXTENSION`); import it from the package root in code loaded outside a bundler (custom endpoints, MCP tools).

## 0.9.0

- **BREAKING**: serve the generate, bulk-generate, and health endpoints under `/api/alt-text/` (previously `/api/alt-text-plugin/`) so the endpoint prefix matches the plugin slug. Any API client calling the old paths must be updated.
- fix: `openAIResolver` now builds its OpenAI client lazily, so a plugin disabled via `enabled: !!process.env.OPENAI_API_KEY` no longer throws at config load when the key is absent

## 0.8.0

- feat: bound and de-duplicate the bulk-generate `ids` array — duplicate IDs are collapsed and requests above the new `maxBulkGenerateIds` option (default 100) are rejected with `400`, so a single request can no longer fan out into an unbounded number of paid resolver calls
- fix: enforce collection access control in the generate and bulk-generate endpoints by running the Local API reads and writes under the requesting user (`overrideAccess: false`)
- fix: return the real HTTP status for access errors in the generate and bulk-generate endpoints — a `Forbidden` now responds `403` (and fails the whole bulk request instead of listing every id as errored) rather than a generic `500`, giving API clients an accurate, non-retryable signal
- fix: reject requests to the generate and bulk-generate endpoints that target a collection the plugin does not manage with `403`, before any document read or write
- fix: filter the alt text health report (endpoint and dashboard widget) to the collections the requesting user may read, so the aggregate no longer discloses counts and document IDs for collections their role cannot access
- feat: `healthCheck` now accepts an access function that gates the health endpoint and hides the dashboard widget, letting the collection-wide report be restricted (e.g. to admins) separately from the generate endpoints
- fix: respect update access in the admin UI — render the alt text field read-only and hide the single-document and bulk generate buttons for users without update access
- fix: reject a generate request whose `locale` is not among the configured locales with `400`, so a write can't target an unconfigured locale and an arbitrary string can't be interpolated into the resolver's prompt

## 0.7.0

- feat: add `baseUrl` option to `openAIResolver` for OpenAI-compatible providers (e.g. Nebius, Azure)

## 0.6.1

- fix: pass `'max'` as the second `revalidateTag` argument so the health-widget cache invalidation no longer triggers Next 16's deprecation warning

## 0.6.0

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16
- fix: respect a user-customized `routes.api` in the generate and bulk-generate buttons (the fetch previously hardcoded `/api/alt-text-plugin/...`)
- refactor: use Payload's `formatAdminURL` helper when linking from the health widget to collection lists

## 0.5.0

> ! This release contains breaking changes.

Alt text is now scoped to image MIME types by default. Documents whose MIME type is not tracked no longer render the alt text field, are not validated for a required alt text, and are excluded from the alt text health widget.

This aligns the plugin with how other CMSs (WordPress, Drupal) handle alt text — as an image-only concept — and fixes mixed-media collections (e.g. videos alongside images) being counted as broken in the health widget. Projects whose configured upload collections only accept images see no behavior change.

The `collections` option now also accepts per-collection entries with a `mimeTypes` override. Bare slug strings continue to work as a shorthand for `['image/*']`:

**Before (v0.4.x):**

```typescript
payloadAltTextPlugin({
  collections: ['media'],
})
```

**After (v0.5.0):**

```typescript
payloadAltTextPlugin({
  // Bare slug — defaults to ['image/*']
  collections: ['media'],

  // Or restrict / extend MIME types per collection
  collections: [
    { slug: 'media', mimeTypes: ['image/*'] },
    { slug: 'documents', mimeTypes: ['application/pdf'] },
  ],
})
```

- feat: scope alt text tracking, validation, and health to configurable per-collection MIME types (default `['image/*']`)
- feat: add a per-collection `validate` option to override the alt text field validator. Exports the default `validateAltText` so projects can compose around it — e.g. to skip the required-alt check when the request body does not touch `alt` (folder moves, partial API updates in localized setups with `fallback: false`, [#95](https://github.com/jhb-software/payload-plugins/issues/95))
- refactor: stop auto-injecting the alt text health widget into `admin.dashboard.defaultLayout`. The widget is still registered under `admin.dashboard.widgets`; add `{ widgetSlug: 'alt-text-health', width: 'full' }` to your `defaultLayout` to show it by default.
- fix: support both Next.js 15 and 16 `revalidateTag` type signatures in the alt text health invalidation hook

## 0.4.4

- style: standardize icons to use Geist icon set (16x16 filled)
- refactor: improve widget translations (pluralize title, simplify German translations, use i18next plural keys for bulk generate button)

## 0.4.3

- fix: reject unsupported file types (e.g. SVG) with clear error showing the MIME type
- style: use Payload Pill component and SVG icons in health widget
- refactor: use i18next interpolation for translations

## 0.4.2

- fix: dashboard health widget not rendering on Payload <3.79.0 (`ComponentPath` was renamed to `Component` in 3.79.0)

## 0.4.1

- fix: fix broken package exports (use pnpm publish to apply publishConfig.exports)

## 0.4.0

- feat: add REST endpoints (`/generate`, `/generate/bulk`, `/health`) with configurable `access` option
- feat: add alt text health check with dashboard widget

## 0.3.1

- fix: update validate function to correctly detect initial upload in Payload >=3.70

## 0.3.0

### Breaking Changes

1. The plugin will only adjust the `admin.listSearchableFields` if the user has not provided their own. Previously, it would always add the filename, keywords and alt fields to the listSearchableFields.
2. The plugin now uses a resolver pattern for alt text generation. This allows integration with any AI provider.

**Before (v0.2.x):**

```typescript
import { payloadAltTextPlugin } from '@jhb.software/payload-alt-text-plugin'

payloadAltTextPlugin({
  collections: ['media'],
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4.1-mini',
  getImageThumbnail: (doc) => doc.url, // your custom function
})
```

**After (v0.3.0):**

```typescript
import { payloadAltTextPlugin, openAIResolver } from '@jhb.software/payload-alt-text-plugin'

payloadAltTextPlugin({
  collections: ['media'],
  resolver: openAIResolver({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4.1-mini', // optional, defaults to 'gpt-4.1-nano'
  }),
  getImageThumbnail: (doc) => doc.url, // your custom function
})
```

## 0.2.2

- fix: add filename to `admin.listSearchableFields` if not already included

## 0.2.1

- fix: replace hardcoded 'media' slug with correct slug in bulk generate component

## 0.2.0

- feat: add support for non-localized setups
- feat: add i18n admin panel translations

## 0.1.0

- Initial release
