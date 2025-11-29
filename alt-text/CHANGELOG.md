# Changelog

## 0.3.0 (Breaking)

### Breaking Changes

The plugin now uses a resolver pattern for alt text generation. This allows integration with any AI provider.

**Before (v0.2.x):**
```typescript
payloadAltTextPlugin({
  collections: ['media'],
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4.1-mini',
  getImageThumbnail: (doc) => doc.url as string,
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
  getImageThumbnail: (doc) => doc.url as string,
})
```

### Features

- feat: add resolver pattern for pluggable AI providers
- feat: export `openAIResolver` for OpenAI integration
- feat: export `AltTextResolver` type for custom implementations

## 0.2.2

- fix: add filename to `admin.listSearchableFields` if not already included

## 0.2.1

- fix: replace hardcoded 'media' slug with correct slug in bulk generate component

## 0.2.0

- feat: add support for non-localized setups
- feat: add i18n admin panel translations

## 0.1.0

- Initial release
