# Image Alt Text Generation Plugin for Payload CMS

A minimal plugin to generate image alt texts using OpenAI's Vision API.

## Installation

```bash
pnpm add @jhb.software/payload-alt-text-plugin
```

## Setup

### 1. Add plugin to Payload config

```typescript
import { payloadAltTextPlugin } from '@jhb.software/payload-alt-text-plugin'

export default buildConfig({
  plugins: [
    payloadAltTextPlugin({
      collections: ['media'], // Specify which upload collections should have alt text fields
      openAIApiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4.1-mini',
      getImageThumbnail: (doc: Record<string, unknown>) => {
        // a function to get a thumbnail URL (e.g. from the sizes)
        return doc.url as string
      },
    }),
  ],
})
```

## Features

When the plugin is enabled for an upload collection, it will

1. Add an alt text field to the collection
   - A button to AI-generate the alt text
   - This field will include a description of what the alt text should be
2. Add a keywords fields to the collection
   - This field will be automatically filled when generating the alt text 
   - It can be used for improving the search of images in the admin panel
2. Add a bulk generate button to the collection list view
   - This button will allow you to generate alt text for multiple images at once

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
