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

## Translation modes

The translator modal offers three actions:

- **Translate all fields** — retranslates every field, discarding existing target content.
- **Translate new & changed content** — incremental mode (see below).
- **Translate only empty fields** — fills target fields that have no value yet, leaving the rest untouched.

### Incremental mode

Incremental mode translates only what actually changed and preserves existing translations, which matters most for `richText`. For a lexical field it diffs the source against the existing translation at the **paragraph / block level**:

- a paragraph whose source text is unchanged keeps its current translation (including any manual edits) and is not retranslated;
- a new or edited source paragraph is translated and placed in source order, so inserts and reorders land in the right position;
- a paragraph removed from the source is removed from the translation;
- if a source paragraph changed **and** its translation had been hand-edited, the human's version is left in place and counted — the success toast reports how many paragraphs need review, so machine accuracy never silently overwrites manual work.

Other field types behave like "translate only empty fields" in incremental mode.

Paragraph identity is content-addressed: a hash of the source text and a hash of the machine output are stored inline on the translated node using Lexical's [NodeState](https://lexical.dev/docs/concepts/node-state) slot (`$`), under a single namespaced key — `"$": { "translator-plugin": { "srcHash": …, "outHash": … } }`. These pass through Payload saves and admin-editor edits untouched (covered by a regression test). Because identity comes from content rather than position, the diff survives inserts, deletes and reorders. The first incremental run on a field translated by an older version (no stored hashes) retranslates it once and then stamps the hashes; subsequent runs are incremental. If a future lexical/Payload release ever stopped preserving the `$` slot, the same merge can fall back to a sidecar field keyed by field path — the algorithm is identical, only the read/write of the hash changes.

## Configuration

### Plugin Options

| Option        | Type                | Required | Description                           |
| ------------- | ------------------- | -------- | ------------------------------------- |
| `collections` | `CollectionSlug[]`  | Yes      | Collections to enable translation for |
| `globals`     | `GlobalSlug[]`      | Yes      | Globals to enable translation for     |
| `resolver`    | `TranslateResolver` | Yes      | Translation resolver to use           |
| `enabled`     | `boolean`           | No       | Whether to enable the plugin.         |

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
