# Changelog

## Unreleased

- refactor: stop auto-injecting the alt text health widget into `admin.dashboard.defaultLayout`. The widget is still registered under `admin.dashboard.widgets`; add `{ widgetSlug: 'alt-text-health', width: 'full' }` to your `defaultLayout` to show it by default.

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
