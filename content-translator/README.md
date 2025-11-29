# JHB Software - Payload Content Translator Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-content-translator)](https://www.npmjs.com/package/@jhb.software/payload-content-translator)

A plugin for [Payload CMS](https://payloadcms.com) that enables AI-powered content translation for localized collections and globals.

## Features

- Translate content between locales using AI resolvers
- Support for OpenAI GPT models
- Custom translation resolvers (OpenAI, Google, Copy)
- Seamless integration with Payload's localization system
- Custom Save/Publish buttons with translation options

## Setup

Install the plugin and add it to your Payload config:

```ts
import { translator, openAIResolver } from '@jhb.software/payload-content-translator'

export default buildConfig({
  // Enable localization
  localization: {
    defaultLocale: 'en',
    locales: ['en', 'de', 'fr'],
  },
  plugins: [
    translator({
      collections: ['pages', 'posts'],
      globals: ['settings'],
      resolvers: [
        openAIResolver({
          apiKey: process.env.OPENAI_API_KEY,
          model: 'gpt-4o-mini',
        }),
      ],
    }),
  ],
})
```

## Configuration

### Plugin Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `collections` | `CollectionSlug[]` | Yes | Collections to enable translation for |
| `globals` | `GlobalSlug[]` | Yes | Globals to enable translation for |
| `resolvers` | `TranslateResolver[]` | Yes | Translation resolvers to use |
| `disabled` | `boolean` | No | Disable the plugin |

### Available Resolvers

#### OpenAI Resolver

```ts
import { openAIResolver } from '@jhb.software/payload-content-translator'

openAIResolver({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini', // or 'gpt-4', 'gpt-3.5-turbo', etc.
})
```

## Acknowledgements

This plugin is based on the translator package from [payload-enchants](https://github.com/r1tsuu/payload-enchants/tree/master/packages/translator) by [@r1tsuu](https://github.com/r1tsuu). It has been modified and adapted to meet specific project requirements.

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
