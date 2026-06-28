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

| Option        | Type                                             | Required | Description                                                                                                |
| ------------- | ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `collections` | `CollectionSlug[]`                               | Yes      | Collections to enable translation for                                                                      |
| `globals`     | `GlobalSlug[]`                                   | Yes      | Globals to enable translation for                                                                          |
| `resolver`    | `TranslateResolver`                              | Yes      | Translation resolver to use                                                                                |
| `enabled`     | `boolean`                                        | No       | Whether to enable the plugin.                                                                              |
| `access`      | `(args: { req }) => boolean \| Promise<boolean>` | No       | Access control for the translate endpoint. Defaults to `({ req }) => !!req.user` (any authenticated user). |

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

The plugin registers a single REST endpoint that the admin UI calls to translate a document or global. It computes the translated values and returns them in the response — it never writes to the database, so changes still go through Payload's normal save/publish flow.

| Method | Path                        | Description                                                          |
| ------ | --------------------------- | -------------------------------------------------------------------- |
| `POST` | `/api/translator/translate` | Translates the given entity's fields and returns the translated data |

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

Beyond this gate, the endpoint reads the source and target documents with `overrideAccess: false`, so each collection's and global's own access control still applies — a user can only translate entities they are allowed to read.

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
