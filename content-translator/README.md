# JHB Software - Payload Content Translator Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-content-translator-plugin)](https://www.npmjs.com/package/@jhb.software/payload-content-translator-plugin)

A plugin that enables content translation directly within the [Payload CMS](https://payloadcms.com) admin panel, using any translation service you prefer. It supports custom translation resolvers and provides a ready-to-use integration with OpenAI.

## Features

- translate content in the Payload Admin UI between locales
- supports any translation service using a resolver pattern (e.g. OpenAI, DeepL, etc.)
- comes with a ready-to-use OpenAI resolver out of the box
- seamless integration with Payload's localization system
- review and edit translations before saving or publishing

## Setup

Install the plugin and add it to your Payload config:

```ts
import {
  payloadContentTranslatorPlugin,
  openAIResolver,
} from '@jhb.software/payload-content-translator-plugin'

export default buildConfig({
  // Enable localization
  localization: {
    defaultLocale: 'en' /* example */,
    locales: ['en', 'de'] /* example */,
  },
  plugins: [
    payloadContentTranslatorPlugin({
      collections: ['pages', 'posts'],
      globals: ['settings'],
      /* openAI or any other resolver */
      resolver: openAIResolver({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
      }),
    }),
  ],
})
```

## Configuration

### Plugin Options

| Option        | Type                                                    | Required | Description                                                                                                                                                                                |
| ------------- | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `collections` | `CollectionSlug[]`                                      | Yes      | Collections to enable translation for                                                                                                                                                      |
| `globals`     | `GlobalSlug[]`                                          | Yes      | Globals to enable translation for                                                                                                                                                          |
| `resolver`    | `TranslateResolver`                                     | Yes      | Translation resolver to use                                                                                                                                                                |
| `enabled`     | `boolean`                                               | No       | Whether to enable the plugin.                                                                                                                                                              |
| `access`      | `(args: { req } & body) => boolean \| Promise<boolean>` | No       | Access control for the translate endpoint. Receives the request plus the parsed body args (`update`, `collectionSlug`, …). Defaults to `({ req }) => !!req.user` (any authenticated user). |

### Per-field control

Any field can declare how the translator should treat it through a
`content-translator` entry in its `custom` config. This is field-local and
provider-agnostic: a field opts into special handling regardless of its name or
type. The config is fully typed via module augmentation of Payload's
`FieldCustom`, so the keys below autocomplete.

| Key               | Type                                | Description                                                                                                                   |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `skip`            | `boolean`                           | Exclude the field from the resolver — its value is not translated. Use alone to let the app own it, or with `afterTranslate`. |
| `beforeTranslate` | `(args) => string`                  | Transform the source string right before it is sent to the resolver. The translated result is written back as usual.          |
| `afterTranslate`  | `(args) => unknown \| Promise<...>` | Post-process the field _after_ the rest of the document is translated. Runs independently of `skip`.                          |

The three keys are orthogonal: `skip` decides whether the field is translated,
`beforeTranslate` pre-processes what is sent, and `afterTranslate` post-processes
the result (or derives a value from translated siblings).

#### Translating slug fields

A slug must never be stored with the raw output of an LLM — it has to stay
URL-safe. There are two strategies, depending on whether the slug should mirror
the title:

**Derive from the title** — the slug always follows the title, so skip
translation and re-slugify the already-translated title (e.g. "Travel Tips" →
`reisetipps`):

```ts
{
  name: 'slug',
  type: 'text',
  localized: true,
  custom: {
    'content-translator': {
      skip: true,
      afterTranslate: ({ siblingData }) => slugify(siblingData.title),
    },
  },
  // validation and other field options...
}
```

**Translate, then normalize** — for a slug intentionally different from the
title, translate the slug text and then slugify it to strip any special
characters the translation introduced:

```ts
{
  name: 'slug',
  type: 'text',
  localized: true,
  custom: {
    'content-translator': {
      // No `skip`: the slug is translated, then cleaned.
      afterTranslate: ({ value }) => slugify(value),
    },
  },
  // validation and other field options...
}
```

`afterTranslate` receives the field's own (translated) `value`, the translated
`siblingData`, the full translated `data`, `sourceValue`, `localeFrom`/`localeTo`,
and `req`. Because it is field-local, this works for any derived or normalized
field under any name — slugs, URL paths, computed keys.

#### With the Pages plugin

The [Pages plugin](https://www.npmjs.com/package/@jhb.software/payload-pages-plugin)
injects the `slug` field into its page collections, so you attach the config with
a small plugin that runs after `payloadPagesPlugin` and derives the slug from the
translated title — normalized with the pages plugin's `formatSlug`, the same rule
the slug field validates against, so the result is always accepted.

See the runnable example: [`makeSlugTranslatable`](https://github.com/jhb-software/payload-plugins/blob/main/content-translator/dev/src/helpers/makeSlugTranslatable.ts)
and [its wiring](https://github.com/jhb-software/payload-plugins/blob/main/content-translator/dev/src/payload.config.ts) in the dev app.

### Resolvers

This plugin is designed to work seamlessly with various translation services by accepting a customizable translation resolver as a configuration option.

An OpenAI resolver is provided out of the box, but you can use any translation provider by creating your own resolver and specifying it in the plugin configuration.

#### OpenAI Resolver

```ts
import { openAIResolver } from '@jhb.software/payload-content-translator-plugin'

openAIResolver({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini', // or 'gpt-4', 'gpt-3.5-turbo', etc.
})
```

## API Endpoint

The plugin registers a single REST endpoint that the admin UI calls to translate a document or global. By default it computes the translated values and returns them in the response without writing to the database, so changes go through Payload's normal save/publish flow. Programmatic callers (e.g. an agent) can opt in to persisting the result with the `update` flag.

| Method | Path                                | Description                                                          |
| ------ | ----------------------------------- | -------------------------------------------------------------------- |
| `POST` | `/api/content-translator/translate` | Translates the given entity's fields and returns the translated data |

#### Request body

| Field            | Type               | Description                                                                                 |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `collectionSlug` | `string`           | Slug of the collection to translate (omit for globals)                                      |
| `globalSlug`     | `string`           | Slug of the global to translate (omit for collections)                                      |
| `id`             | `string \| number` | Document id (required for collections)                                                      |
| `locale`         | `string`           | Target locale to translate into                                                             |
| `localeFrom`     | `string`           | Source locale to translate from                                                             |
| `emptyOnly`      | `boolean`          | Only translate fields that are still empty in the target locale (default `false`)           |
| `update`         | `boolean`          | Persist the translation to the target locale instead of only returning it (default `false`) |
| `draft`          | `boolean`          | When `update` is `true`, save as a draft version instead of publishing (default `false`)    |

#### Persisting translations (agents)

With `update: true` the endpoint writes the translation to the target locale and returns the same payload. The write runs with `overrideAccess: false`, so the authenticated user (typically an API key) must hold `update` access on the target collection/global. Add `draft: true` to save as a draft for human review instead of publishing.

```bash
curl -X POST https://example.com/api/content-translator/translate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: users API-Key <your-api-key>' \
  -d '{
    "collectionSlug": "pages",
    "id": "123",
    "localeFrom": "en",
    "locale": "de",
    "update": true,
    "draft": true
  }'
```

Source content is always read from the latest draft, so translations cover unpublished work-in-progress. Saving with `update: true` and `draft: false` therefore publishes content derived from the current draft — use `draft: true` if a review step before publishing is required.

### Authentication

The endpoint requires an authenticated request and responds with `401` otherwise. By default any authenticated Payload user (admin session or API key) is allowed:

```ts
;({ req }) => !!req.user
```

Override this with the `access` option to restrict who may translate content:

```ts
// Only allow admins to use the translate endpoint
access: ({ req }) => req.user?.role === 'admin'
```

The access function also receives the parsed request body, so persisting (`update: true`) can be gated separately from returning translations:

```ts
// Anyone signed in may translate-and-return; only editors may persist
access: ({ req, update }) => (update ? req.user?.role === 'editor' : !!req.user)
```

> **Security:** every field other than `req`/`req.user` is supplied by the caller. Grant access based on `req.user` and use the body args only to _restrict_ further (e.g. require a role for `update`); never _widen_ access based on a value the caller sent.

Beyond this gate, the endpoint always reads and writes with `overrideAccess: false`, so each collection's and global's own access control still applies — a user can only translate entities they may read, and `update: true` only persists when they have update access. The endpoint never honors an `overrideAccess` value sent in the request body.

## Custom Resolver

You can create your own resolver by implementing the `TranslateResolver` interface.

```ts
import type { TranslateResolver } from '@jhb.software/payload-content-translator-plugin'

export const customResolver = (): TranslateResolver => ({
  key: 'custom',
  resolve: ({ localeTo, texts }) => {
    const translatedTexts = texts.map((text) => {
      /* your custom translation logic here */
      return text
    })

    return { success: true, translatedTexts }
  },
})
```

## Acknowledgements

This plugin builds upon the translator package from [payload-enchants](https://github.com/r1tsuu/payload-enchants/tree/master/packages/translator) and has been refined and streamlined with additional enhancements and fixes.

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
