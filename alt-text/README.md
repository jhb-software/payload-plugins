# Image Alt Text Generation Plugin for Payload CMS

A [Payload CMS](https://payloadcms.com/) plugin that adds AI-powered alt text generation for images. I automatically adds an alt text field with a button to generate the alt text to specified upload collections, and includes a bulk generation feature in the list view for processing multiple images at once.

## Features

- Generate alt text for images using AI in the Payload Admin UI
- Supports any AI provider using a resolver pattern (e.g., OpenAI, Anthropic, etc.)
- Comes with ready-to-use OpenAI, Anthropic and Mistral resolvers out of the box
- Automatic keyword extraction for improved admin search
- Bulk generation for processing multiple images at once
- Full localization support
- Dashboard health widget with cached coverage insights across all configured upload collections
- Multi-tenant aware: the health report can be scoped to the tenant the request is for

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

| Option                       | Type                                       | Required | Description                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collections`                | `(CollectionSlug \| CollectionObj)[]`      | Yes      | Collections to enable alt text generation for (see [Per-collection options](#per-collection-options))                                                                                                                                                                                                 |
| `resolver`                   | `AltTextResolver`                          | Yes      | Alt text resolver to use (e.g., `openAIResolver`)                                                                                                                                                                                                                                                     |
| `getImageThumbnail`          | `Function`                                 | Yes      | Function to get the thumbnail URL from an image document                                                                                                                                                                                                                                              |
| `enabled`                    | `boolean`                                  | No       | Whether to enable the plugin                                                                                                                                                                                                                                                                          |
| `access`                     | `({ req }) => boolean \| Promise<boolean>` | No       | Access control for the plugin's REST endpoints. Defaults to `({ req }) => !!req.user` (any authenticated user) — see [Authentication](#authentication)                                                                                                                                                |
| `locale`                     | `string`                                   | No       | Locale for alt text generation (required when localization is disabled)                                                                                                                                                                                                                               |
| `maxBulkGenerateConcurrency` | `number`                                   | No       | Maximum concurrent API requests for bulk operations (default: 16)                                                                                                                                                                                                                                     |
| `maxBulkGenerateIds`         | `number`                                   | No       | Maximum number of image IDs accepted per bulk generate request; larger requests are rejected with `400`. Duplicate IDs are collapsed before the limit is applied (default: 100)                                                                                                                       |
| `fieldsOverride`             | `Function`                                 | No       | Override the default fields inserted by the plugin                                                                                                                                                                                                                                                    |
| `healthCheck`                | `boolean \| AltTextHealthCheckConfig`      | No       | Alt text health tracking (REST endpoint, cache revalidation hooks, dashboard widget). `false` disables it; `true` enables it for every document, gated by `access`; an object enables it and configures its `access` gate and `baseFilter` (see [Health report](#dashboard-widget)) (default: `true`) |
| `imageThumbnailMimeType`     | `string`                                   | No       | The MIME type `getImageThumbnail` delivers. Set it when your thumbnail URL transcodes the image, so the stored format no longer decides whether generation is possible (see [Transcoding thumbnails](#transcoding-thumbnails))                                                                        |

`getImageThumbnail` receives the document and `{ collection, req }`, so a single function can build different URLs per collection:

```ts
getImageThumbnail: (doc, { collection }) =>
  collection === 'media' ? cloudinaryThumbnail(doc) : String(doc.url)
```

It may also be async, so the URL can be signed on demand:

```ts
getImageThumbnail: async (doc, { req }) => await presignThumbnailUrl(String(doc.url), req)
```

### Per-collection options

Each entry in `collections` may be either a bare collection slug (shorthand, defaults to `['image/*']` for `mimeTypes`) or an object with the following fields:

| Option                   | Type                      | Required | Description                                                                                                                                                                                       |
| ------------------------ | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                   | `CollectionSlug`          | Yes      | The collection slug                                                                                                                                                                               |
| `mimeTypes`              | `string[]`                | No       | MIME types the plugin tracks, validates, and generates for. Supports wildcards like `image/*`. Defaults to `['image/*']`.                                                                         |
| `validate`               | `TextareaFieldValidation` | No       | Custom validator that fully replaces the default required-alt check. Import `validateAltText` from the plugin to compose around the default behavior (see [Custom validator](#custom-validator)). |
| `imageThumbnailMimeType` | `string \| null`          | No       | Overrides the plugin-level option of the same name for this collection. `null` opts the collection out of a plugin-level default (see [Transcoding thumbnails](#transcoding-thumbnails)).         |

```ts
payloadAltTextPlugin({
  collections: [
    'images', // shorthand — defaults to mimeTypes: ['image/*']
    { slug: 'media', mimeTypes: ['image/*', 'application/pdf'] },
  ],
  // ...
})
```

#### Transcoding thumbnails

The resolver never sees the stored file — it only receives the URL returned by `getImageThumbnail`. When a resolver declares `supportedMimeTypes`, the plugin checks a document's stored `mimeType` against that list, which is a safe default but wrong as soon as your thumbnail URL transcodes: an AVIF or HEIC upload served through a Cloudinary `f_webp` transformation reaches the provider as WebP, yet gets rejected on its stored format.

Declare what your thumbnail URL actually delivers to remove the mismatch:

```ts
payloadAltTextPlugin({
  collections: ['media'],
  resolver: openAIResolver({ apiKey: process.env.OPENAI_API_KEY }),
  // Always transcodes to WebP, whatever the source format is
  getImageThumbnail: (doc) => String(doc.url).replace('/upload/', '/upload/w_600,f_webp/'),
  imageThumbnailMimeType: 'image/webp',
})
```

With the declaration in place, the source format no longer gates generation — the admin button stays enabled and the endpoints stop rejecting on `mimeType`. Which source formats get alt text at all is still governed by each collection's `mimeTypes`. The declaration is validated against the resolver's `supportedMimeTypes` once at config load, so transcoding into a format your resolver cannot handle fails at boot instead of once per image.

Only declare a format your transformation **always** produces. A `f_auto`-style transformation negotiates the format from the fetching client's `Accept` header and may serve the source format back, so leave it unset there and let the conservative source check apply. If you want AVIF sources to work, transcode explicitly.

Collections may override the plugin-level value, or opt out of it with `null` when they are served raw:

```ts
payloadAltTextPlugin({
  collections: [
    'media', // inherits image/webp
    { slug: 'documents', imageThumbnailMimeType: null }, // checked on its stored mimeType
  ],
  imageThumbnailMimeType: 'image/webp',
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

#### Gating and scoping the report

`healthCheck` also takes an object. The main use of `baseFilter` is multi-tenancy: scope the report to the tenant selected in the admin panel, whose id [@payloadcms/plugin-multi-tenant](https://payloadcms.com/docs/plugins/multi-tenant) keeps in the `payload-tenant` cookie.

```ts
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'

healthCheck: {
  // Restrict the collection-wide report more strictly than the per-document
  // generate endpoints. Gates the REST endpoint and hides the widget.
  access: ({ req }) => req.user?.role === 'admin',
  // Narrow what the report counts, e.g. to the tenant selected in the admin panel.
  baseFilter: ({ collection, req }) => {
    const tenant = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)

    return tenant ? { tenant: { equals: tenant } } : {}
  },
}
```

`baseFilter` returns a `Where` that is ANDed onto the scan's MIME type filter. It is resolved once per configured collection, so a collection that does not carry the constraining field — a media library shared across tenants, say — can return `{}` and be scanned whole. Returning `{}` for every collection is the default behaviour.

The scan is cached across requests, and its cache key is derived from the resolved filters: a narrowed scan always gets its own cache entry, so one tenant's counts can never be served to another. Cache invalidation stays per collection, so a write in one tenant refreshes the report for all of them.

This scopes what the report counts, not who may see it — use `access` for that. Independently of both, the report always omits the collections the requesting user cannot read.

#### Skipping cache revalidation for individual writes

The plugin invalidates the cached health scan via `afterChange` and `afterDelete` hooks. For writes that don't need to invalidate the cache — typically seed data created from `payload.onInit`, batch imports, or migrations — pass `context: { disableRevalidate: true }` to skip the revalidation:

```ts
await payload.create({
  collection: 'media',
  data: {/* ... */},
  context: { disableRevalidate: true },
})
```

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

| Option               | Type       | Required | Description                                                                                                                                                                                 |
| -------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`             | `string`   | Yes      | API key for authentication                                                                                                                                                                  |
| `model`              | `string`   | No       | Model to use (default: `gpt-4.1-nano`)                                                                                                                                                      |
| `baseUrl`            | `string`   | No       | Base URL for an OpenAI-compatible provider, version segment included (default: `https://api.openai.com/v1`; e.g. Nebius, Azure)                                                             |
| `supportedMimeTypes` | `string[]` | No       | Image formats the provider accepts (default: `['image/jpeg', 'image/png', 'image/gif', 'image/webp']`, per OpenAI's vision docs). Override it when using a `baseUrl` whose provider differs |
| `timeoutMs`          | `number`   | No       | Abort after this many milliseconds, retries included (default: `30000`)                                                                                                                     |
| `instructions`       | `function` | No       | Customizes the prompt, see [Customizing the instructions](#customizing-the-instructions)                                                                                                    |

#### Mistral Resolver

```ts
import { mistralResolver } from '@jhb.software/payload-alt-text-plugin'

mistralResolver({
  apiKey: process.env.MISTRAL_API_KEY,
  model: 'mistral-medium-latest', // default; any vision-capable Mistral model works
})
```

Unlike the OpenAI resolver, this one downloads the image and sends the bytes
rather than handing Mistral the thumbnail URL. Mistral's own fetcher needs the
file to be reachable from the public internet, which is never the case in local
development and not the case for private buckets; some hosts also refuse it
outright (`File could not be fetched from url`, error 3310). Sending the bytes
costs one extra download and removes that whole class of failure.

Because there is no image conversion step, `supportedMimeTypes` is limited to
what the Mistral API accepts directly: JPEG, PNG, GIF and WebP. Documents in
other formats — SVG or AVIF, for instance — keep their generate button disabled.

| Option         | Type       | Required | Description                                                                              |
| -------------- | ---------- | -------- | ---------------------------------------------------------------------------------------- |
| `apiKey`       | `string`   | Yes      | API key for authentication                                                               |
| `model`        | `string`   | No       | Model to use (default: `mistral-medium-latest`)                                          |
| `baseUrl`      | `string`   | No       | Base URL of the Mistral API (default: `https://api.mistral.ai/v1`)                       |
| `timeoutMs`    | `number`   | No       | Abort after this many milliseconds, image download included (default: `30000`)           |
| `instructions` | `function` | No       | Customizes the prompt, see [Customizing the instructions](#customizing-the-instructions) |

#### Anthropic Resolver

```ts
import { anthropicResolver } from '@jhb.software/payload-alt-text-plugin'

anthropicResolver({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-opus-5', // default; `claude-sonnet-5` is cheaper for a large library
  effort: 'low', // optional; describing an image needs little thinking
})
```

Like the Mistral resolver, this one downloads the image and sends the bytes.
Claude can fetch an image URL itself, but that requires the file to be reachable
from the public internet, which is never the case in local development and not
the case for private buckets. Sending the bytes also supplies the `media_type`
that a base64 image block requires and a URL cannot carry.

`supportedMimeTypes` is limited to what the Messages API accepts: JPEG, PNG, GIF
and WebP. Documents in other formats keep their generate button disabled.

| Option         | Type                                              | Required | Description                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`       | `string`                                          | Yes      | API key for authentication                                                                                                                                                                                                   |
| `model`        | `string`                                          | No       | Model to use (default: `claude-opus-5`). `claude-sonnet-5` is cheaper; `claude-haiku-4-5` works too, but only without `effort`                                                                                               |
| `effort`       | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'` | No       | How long Claude thinks before answering. `low` is plenty for describing an image and keeps the spend down. Omitted, the field is not sent and Claude uses its default (`high`), so models without effort support stay usable |
| `baseUrl`      | `string`                                          | No       | Base URL of the Anthropic API (default: `https://api.anthropic.com`)                                                                                                                                                         |
| `timeoutMs`    | `number`                                          | No       | Abort after this many milliseconds, image download included (default: `30000`)                                                                                                                                               |
| `instructions` | `function`                                        | No       | Customizes the prompt, see [Customizing the instructions](#customizing-the-instructions)                                                                                                                                     |

### Customizing the instructions

Every bundled resolver accepts an `instructions` function that receives the
instructions the resolver would send on its own, so a house style rule can be
appended without restating the rules the plugin depends on:

```ts
openAIResolver({
  apiKey: process.env.OPENAI_API_KEY!,
  instructions: ({ defaultInstructions }) =>
    `${defaultInstructions}\n\nName the product line when its packaging is legible. Never guess at a person's role.`,
})
```

It is called once per generation and receives `{ defaultInstructions, locales, filename }`.
Returning something entirely different is allowed — the image and the required
response shape travel separately from the instructions, so a replacement cannot
break the resolver's contract with its provider.

## Custom Resolver

For another LLM provider, `createVisionResolver` is usually the shortest path: it
owns the prompt, the per-locale response schema, the optional image download and
the strict reading of the response, leaving only the provider call to `generate`.
Every bundled resolver is built on it.

```ts
import { createVisionResolver, VisionProviderError } from '@jhb.software/payload-alt-text-plugin'

export const myResolver = ({ apiKey }: { apiKey: string }) =>
  createVisionResolver({
    apiKey,
    // `image` is only present when `inlineImage` is set; otherwise pass
    // `imageThumbnailUrl` to the provider and let it fetch the file.
    generate: async ({ image, instructions, maxTokens, responseSchema, signal }) => {
      if (!image) {
        throw new Error('The image was not downloaded')
      }

      const response = await fetch('https://api.example.com/v1/vision', {
        body: JSON.stringify({ instructions, image: image.dataUri, schema: responseSchema }),
        headers: { Authorization: `Bearer ${apiKey}` },
        method: 'POST',
        signal,
      })

      // A rate limit or an outage is worth another attempt: throwing
      // `VisionProviderError` lets the factory retry it. Any other error fails
      // the generation immediately, with its message shown in the admin panel.
      if (!response.ok) {
        throw new VisionProviderError({ label: 'My Provider', status: response.status })
      }

      // Return the parsed JSON object.
      return await response.json()
    },
    inlineImage: true,
    key: 'my-provider',
    label: 'My Provider',
    supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  })
```

A provider call that fails with `VisionProviderError` is retried twice, with a
short backoff, when the status is a rate limit (`429`) or a server-side failure
(`5xx`) — a bulk generation trips those routinely, and giving up on the first one
leaves documents without an alt text. Any other status fails immediately: a `4xx`
would fail identically on every attempt. The resolver's `timeoutMs` covers the
attempts together.

For a provider that does not fit that shape at all, implement the
`AltTextResolver` interface directly.

Alongside `imageThumbnailUrl`, the resolver receives `imageThumbnailMimeType` — the format served at that URL, when the collection declares one via [`imageThumbnailMimeType`](#transcoding-thumbnails). Resolvers that hand the URL to the provider can ignore it. Resolvers that inline the bytes need it, because an explicit media type cannot be sniffed from a URL: Anthropic image blocks require `media_type` and Gemini's `inline_data` requires `mime_type`. It is `undefined` when nothing was declared. Resolvers built on `createVisionResolver` get this for free: `image.mediaType` is the type the host actually served, with the declaration standing in when the host sent none or a generic `application/octet-stream`.

```ts
import type { AltTextResolver } from '@jhb.software/payload-alt-text-plugin'

export const customResolver = (): AltTextResolver => ({
  key: 'custom',
  resolve: async ({ imageThumbnailUrl, imageThumbnailMimeType, filename, locale, req }) => {
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

The plugin registers the following REST API endpoints under `/api/alt-text/`.

### Authentication

The endpoints require an authenticated request and respond with `401` otherwise. By default any authenticated Payload user (admin session or API key) is allowed:

```ts
;({ req }) => !!req.user
```

That default fits a setup where every Payload user is trusted staff. Generating alt text spends money at the configured provider and the bulk endpoint writes to many documents at once, so projects with public sign-up, customer-facing accounts, or any user tier that should not incur provider cost must narrow it via the `access` option:

```ts
// Only allow editors to use the generate endpoints
access: ({ req }) => req.user?.role === 'editor'
```

Beyond that gate, the generate endpoints enforce each collection's own access control on the documents they read and write, and the health endpoint reports only the collections the requesting user can read (and can be gated separately via `healthCheck.access`).

### `POST /api/alt-text/generate`

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

### `POST /api/alt-text/generate/bulk`

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

### `GET /api/alt-text/health`

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
