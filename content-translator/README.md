# JHB Software - Payload Content Translator Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-content-translator)](https://www.npmjs.com/package/@jhb.software/payload-content-translator)

A plugin for [Payload CMS](https://payloadcms.com) that enables AI-powered content translation for localized collections and globals.

## Features

- Translate content in the Payload Admin UI between locales
- abstraction to use different translation resolvers (e.g. OpenAI, DeepL, etc.)
- Seamless integration with Payload's localization system
- Review and edit translations before saving or publishing

## Setup

Install the plugin and add it to your Payload config:

```ts
import { translator, openAIResolver } from '@jhb.software/payload-content-translator'

export default buildConfig({
  // Enable localization
  localization: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
  },
  plugins: [
    translator({
      collections: ['pages', 'posts'],
      globals: ['settings'],
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

### Available Resolvers

The plugin comes with an openAI resolver out of the box, but you can use any other translation resolver by creating your own and passing it to the plugin config.

// TODO: short example of a custom resolver with noop

## Acknowledgements

This plugin is based on the translator package from [payload-enchants](https://github.com/r1tsuu/payload-enchants/tree/master/packages/translator) by [@r1tsuu](https://github.com/r1tsuu). It has been modified and adapted to meet specific project requirements.

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
