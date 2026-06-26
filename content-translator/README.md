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

| Option        | Type                | Required | Description                           |
| ------------- | ------------------- | -------- | ------------------------------------- |
| `collections` | `CollectionSlug[]`  | Yes      | Collections to enable translation for |
| `globals`     | `GlobalSlug[]`      | Yes      | Globals to enable translation for     |
| `resolver`    | `TranslateResolver` | Yes      | Translation resolver to use           |
| `enabled`     | `boolean`           | No       | Whether to enable the plugin.         |

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

```ts
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
```

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
      afterTranslate: ({ siblingData }) => slugify(String(siblingData.title ?? '')),
    },
  },
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
      afterTranslate: ({ value }) => slugify(String(value ?? '')),
    },
  },
}
```

`afterTranslate` receives the field's own (translated) `value`, the translated
`siblingData`, the full translated `data`, `sourceValue`, `localeFrom`/`localeTo`,
and `req`. Because it is field-local, this works for any derived or normalized
field under any name — slugs, URL paths, computed keys.

#### With the Pages plugin's slug field

The [Pages plugin](https://www.npmjs.com/package/@jhb.software/payload-pages-plugin)
ships a localized `slug` field. Spread its config and attach the translator
handling so translating a document produces a localized slug:

```ts
import { slugField } from '@jhb.software/payload-pages-plugin'

const slug = slugField({ fallbackField: 'title' })

export const translatableSlug = {
  ...slug,
  custom: {
    ...slug.custom,
    'content-translator': {
      // Derive the slug from the translated title rather than translating it.
      // Use the same slugify rules the slug field validates against so the
      // result is accepted.
      skip: true,
      afterTranslate: ({ siblingData }) => slugify(String(siblingData.title ?? '')),
    },
  },
}
```

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
