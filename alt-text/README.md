# Image Alt Text Generation Plugin for Payload CMS

A [Payload CMS](https://payloadcms.com/) plugin that adds AI-powered alt text generation for images. I automatically adds an alt text field with a button to generate the alt text to specified upload collections, and includes a bulk generation feature in the list view for processing multiple images at once.

## Features

- Generate alt text for images using AI in the Payload Admin UI
- Supports any AI provider using a resolver pattern (e.g., OpenAI, Anthropic, etc.)
- Comes with a ready-to-use OpenAI resolver out of the box
- Automatic keyword extraction for improved admin search
- Bulk generation for processing multiple images at once
- Full localization support
- Dashboard health widget with cached coverage insights across all configured upload collections

When the plugin is enabled for an upload collection, it will:

1. Add an alt text field to the collection
   - A button to AI-generate the alt text
   - This field will include a description of what the alt text should be
2. Add a keywords fields to the collection
   - This field will be automatically filled when generating the alt text
   - It will be used for improving the search of images in the admin panel
3. Add a bulk generate button to the collection list view
   - This button will allow you to generate alt text for multiple images at once
4. Register an `Alt text health` dashboard widget
   - Results are cached and revalidated when documents in the configured upload collections change

## Installation

```bash
pnpm add @jhb.software/payload-alt-text-plugin
```

## Setup

Install the plugin and add it to your Payload config:

```ts
import { payloadAltTextPlugin, openAIResolver } from '@jhb.software/payload-alt-text-plugin'

export default buildConfig({
  plugins: [
    payloadAltTextPlugin({
      collections: ['media'],
      resolver: openAIResolver({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4.1-mini', // optional, defaults to 'gpt-4.1-nano'
      }),
      getImageThumbnail: (doc) => doc.url, // a function to get a thumbnail URL (e.g. from the sizes)
    }),
  ],
})
```

Note: When localization is disabled in your Payload config (default), you need to specify the locale to generate the alt texts in via the `locale` plugin option.

To restrict which MIME types the plugin tracks, validates, and generates for — or to override the default validator on a per-collection basis — pass an object instead of a bare slug. See [Per-collection options](#per-collection-options).

### Admin list search

By default, the plugin sets `admin.listSearchableFields` on the configured upload collections to `['filename', 'keywords', 'alt']` so the admin list-view search matches against these fields. To opt out, set `admin.listSearchableFields` on the collection yourself — any explicit value is preserved as-is:

```ts
{
  slug: 'media',
  upload: true,
  admin: {
    listSearchableFields: ['filename', 'alt'],
  },
  // ...
}
```

This is also the recommended escape hatch if you hit Payload's Postgres SQL-builder bug for `hasMany` localized text fields in `listSearchableFields` (see [#92](https://github.com/jhb-software/payload-plugins/issues/92)).

## Configuration

### Plugin Options

| Option                       | Type                                  | Required | Description                                                                                                      |
| ---------------------------- | ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `collections`                | `(CollectionSlug \| CollectionObj)[]` | Yes      | Collections to enable alt text generation for (see [Per-collection options](#per-collection-options))            |
| `resolver`                   | `AltTextResolver`                     | Yes      | Alt text resolver to use (e.g., `openAIResolver`)                                                                |
| `getImageThumbnail`          | `Function`                            | Yes      | Function to get the thumbnail URL from an image document                                                         |
| `enabled`                    | `boolean`                             | No       | Whether to enable the plugin                                                                                     |
| `locale`                     | `string`                              | No       | Locale for alt text generation (required when localization is disabled)                                          |
| `maxBulkGenerateConcurrency` | `number`                              | No       | Maximum concurrent API requests for bulk operations (default: 16)                                                |
| `fieldsOverride`             | `Function`                            | No       | Override the default fields inserted by the plugin                                                               |
| `healthCheck`                | `boolean`                             | No       | Enable alt text health tracking: REST endpoint, cache revalidation hooks, and dashboard widget (default: `true`) |

### Per-collection options

Each entry in `collections` may be either a bare collection slug (shorthand, defaults to `['image/*']` for `mimeTypes`) or an object with the following fields:

| Option      | Type                      | Required | Description                                                                                                                                                                                       |
| ----------- | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`      | `CollectionSlug`          | Yes      | The collection slug                                                                                                                                                                               |
| `mimeTypes` | `string[]`                | No       | MIME types the plugin tracks, validates, and generates for. Supports wildcards like `image/*`. Defaults to `['image/*']`.                                                                         |
| `validate`  | `TextareaFieldValidation` | No       | Custom validator that fully replaces the default required-alt check. Import `validateAltText` from the plugin to compose around the default behavior (see [Custom validator](#custom-validator)). |

```ts
payloadAltTextPlugin({
  collections: [
    'images', // shorthand — defaults to mimeTypes: ['image/*']
    { slug: 'media', mimeTypes: ['image/*', 'application/pdf'] },
  ],
  // ...
})
```

#### Custom validator

The default validator requires alt text on every tracked document. Some workflows — folder moves, partial API updates, or localized setups with `fallback: false` where some locales are intentionally empty — need to skip that check when the request body does not touch `alt`. Pass a `validate` function to override the default, and compose around the exported `validateAltText` to keep the standard behavior for full updates:

```ts
import { payloadAltTextPlugin, validateAltText } from '@jhb.software/payload-alt-text-plugin'

payloadAltTextPlugin({
  collections: [
    {
      slug: 'media',
      validate: (value, args) => {
        // Skip the required-alt check when the request body does not touch `alt`
        // (e.g. folder moves, partial API updates).
        if (!args.req.data || !('alt' in args.req.data)) return true
        return validateAltText(value, args)
      },
    },
  ],
  // ...
})
```

## Dashboard Widget

The plugin registers an `Alt text health` dashboard widget that shows alt text coverage across all configured upload collections, with cached queries that revalidate on document changes. Collections with missing alt text show a clickable badge linking to the affected images.

<img width="696" height="246" alt="image" src="https://github.com/user-attachments/assets/75df7349-0307-4047-b1ac-6b2ee0814464" />

The widget is registered under `admin.dashboard.widgets` with the slug `alt-text-health`. To show it by default on the dashboard, add it to your `admin.dashboard.defaultLayout`:

```ts
buildConfig({
  admin: {
    dashboard: {
      defaultLayout: [
        // ...other default widgets
        { widgetSlug: 'alt-text-health', width: 'full' },
      ],
    },
  },
  // ...
})
```

Set `healthCheck: false` in the plugin config to disable the REST endpoint, cache revalidation hooks, and dashboard widget. If your project replaces the default dashboard via `admin.components.views.dashboard`, you need to integrate the widget into your custom dashboard yourself.

#### Skipping cache revalidation for individual writes

The plugin invalidates the cached health scan via `afterChange` and `afterDelete` hooks. For writes that don't need to invalidate the cache — typically seed data created from `payload.onInit`, batch imports, or migrations — pass `context: { disableRevalidate: true }` to skip the revalidation:

```ts
await payload.create({
  collection: 'media',
  data: {
    /* ... */
  },
  context: { disableRevalidate: true },
})
```

This is also useful as an escape hatch in older Next.js setups where `revalidateTag` is not safe to call from your write site (the plugin already defers the call via `after()` to escape render scopes, so this is rarely needed at runtime).

### Resolvers

This plugin is designed to work seamlessly with various AI providers by accepting a customizable resolver as a configuration option.

An OpenAI resolver is provided out of the box, but you can use any AI provider by creating your own resolver and specifying it in the plugin configuration.

#### OpenAI Resolver

```ts
import { openAIResolver } from '@jhb.software/payload-alt-text-plugin'

openAIResolver({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4.1-mini', // or 'gpt-4.1-nano' (default)
})
```

## Custom Resolver

You can create your own resolver by implementing the `AltTextResolver` interface.

```ts
import type { AltTextResolver } from '@jhb.software/payload-alt-text-plugin'

export const customResolver = (): AltTextResolver => ({
  key: 'custom',
  resolve: async ({ imageThumbnailUrl, filename, locale, req }) => {
    // Your custom alt text generation logic here
    const altText = await generateAltText(imageThumbnailUrl, filename, locale, req)

    return {
      success: true,
      result: altText,
    }
  },
  resolveBulk: async ({ imageThumbnailUrl, filename, locales, req }) => {
    // Your custom alt text generation logic here
    const altTexts = await generateAltTextBulk(imageThumbnailUrl, filename, locales, req)

    return {
      success: true,
      results: altTexts,
    }
  },
})
```

## REST API Endpoints

The plugin registers the following REST API endpoints under `/api/alt-text-plugin/`. All endpoints require authentication by default (configurable via the `access` option).

### `POST /api/alt-text-plugin/generate`

Generates alt text for a single image. By default, returns the result without saving it (preview mode). Pass `update: true` to also persist the generated alt text and keywords to the document.

**Request body:**

| Field        | Type               | Required | Description                                                         |
| ------------ | ------------------ | -------- | ------------------------------------------------------------------- |
| `id`         | `string \| number` | Yes      | The document ID                                                     |
| `collection` | `string`           | Yes      | The collection slug                                                 |
| `locale`     | `string \| null`   | Yes      | Target locale (use `null` for non-localized setups)                 |
| `update`     | `boolean`          | No       | When `true`, persists the result to the document (default: `false`) |

**Response:**

```json
{
  "id": "abc123",
  "collection": "media",
  "altText": "A canal scene in a European city with historic buildings.",
  "keywords": ["canal", "buildings", "European city"]
}
```

### `POST /api/alt-text-plugin/generate/bulk`

Generates and persists alt text for multiple images across all configured locales.

**Request body:**

| Field        | Type                   | Required | Description                      |
| ------------ | ---------------------- | -------- | -------------------------------- |
| `collection` | `string`               | Yes      | The collection slug              |
| `ids`        | `(string \| number)[]` | Yes      | Array of document IDs to process |

**Response:**

```json
{
  "updatedDocs": 5,
  "totalDocs": 6,
  "erroredDocs": ["abc789"]
}
```

### `GET /api/alt-text-plugin/health`

Returns alt text coverage statistics across all configured collections. Only available when `healthCheck` is enabled.

**Response:**

```json
{
  "checkedAt": "2025-01-01T00:00:00.000Z",
  "collections": [
    {
      "collection": "media",
      "totalDocs": 12,
      "completeDocs": 10,
      "partialDocs": 1,
      "missingDocs": 1,
      "invalidDocIds": ["abc123"]
    }
  ],
  "isLocalized": true,
  "localeCodes": ["en", "de"],
  "errors": []
}
```

## Roadmap

> **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
