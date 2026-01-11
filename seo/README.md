# JHB Software - Payload SEO Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-seo-plugin)](https://www.npmjs.com/package/@jhb.software/payload-seo-plugin)

Extends the official [SEO plugin](https://payloadcms.com/docs/plugins/seo) with additional features:

- AI-powered meta description generation for compelling search results
- Focus keyword tracking with intelligent warnings when keywords are missing from crucial elements (title, description, content)
- Multi-keyword support with content usage analytics

![SEO Plugin - AI-powered Meta Description and Keyword Tracking](./images/screenshot-1.png)

## Setup

Add the plugin to your payload config as follows:

```ts
 plugins: [
    payloadSeoPlugin({
      // ### Options which are passed to the official seo plugin ###
      collections: ['pages', 'projects'],

      // ### Options of this seo plugin ###
      websiteContext: {
        topic: 'A website of a software developer for mobile, web-apps and websites.',
      },
      documentContentTransformers: {
        pages: async (doc, lexicalToPlainText) => ({
          title: doc.title,
          body: (await lexicalToPlainText(doc.body)) ?? '',
        }),
        projects: async (doc, lexicalToPlainText) => ({
          title: doc.title,
          excerpt: doc.excerpt,
          tags: doc.tags?.join(', '),
          body: (await lexicalToPlainText(doc.body)) ?? '',
        }),
      },
    }),
  ],
```

Because this plugin extends the official SEO plugin, you can pass all config options of the official SEO plugin to this plugin.

### Config options

For information about the config options of this plugin, see the [SeoPluginConfig](https://github.com/jhb-software/payload-plugins/blob/main/seo/src/types/SeoPluginConfig.ts) type.

### Environment variables

The following environment variables are required:

- `OPENAI_API_KEY`
