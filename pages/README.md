# JHB Software - Payload Pages Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-pages-plugin)](https://www.npmjs.com/package/@jhb.software/payload-pages-plugin)

The Payload Pages plugin simplifies website building by adding essential fields to your collections. These fields enable hierarchical page structures and dynamic URL management.

## Setup

Add the plugin to your payload config as follows:

```ts
plugins: [payloadPagesPlugin({})]
```

Use the `createPagesCollectionConfig` function to create a collection config for the Pages collection. This adds all necessary fields and hooks to the collection. The `page` field must be specified as follows:

- `parentCollection`: The slug of the collection that will be used as the parent of the current collection.
- `parentField`: The name of the field on the parent collection that will be used to relate to the current collection.
- `isRootCollection`: Whether the collection is the root collection (collection which contains the root page). If true, the parent field is optional. Defaults to `false`.
- `sharedParentDocument` (optional, defaults to `false`): If true, the parent document will be shared between all documents in the collection.
- `breadcrumbLabelField` (optional, defaults to `admin.useAsTitle`): The name of the field that will be used to label the document in the breadcrumb.
- `slugFallbackField` (optional, defaults to `title`): The name of the field that will be used as the fallback for the slug.

```ts
import { createPagesCollectionConfig } from '@jhb.software/payload-pages-plugin'

const Projects: CollectionConfig = createPageCollectionConfig({
  slug: 'projects',
  page: {
    parentCollection: 'pages',
    parentField: 'parent',
  },
  // configure the rest as normal
})
```

Additionally create the redirect collection:

```ts
import { createRedirectsCollectionConfig } from '@jhb.software/payload-pages-plugin'

const redirectsCollection = createRedirectsCollectionConfig({})
```

In order for the official payload SEO plugin to use the generated URL, you need to pass the `generateUrl` function to the `generateUrl` field in the `seo` plugin config inside your payload config. Also add the `alternatePathsField` field to the fields array.

```ts
export default buildConfig({
  // ...
  plugins: [
    seoPlugin({
      generateURL: ({ doc }) => getPageUrl({ path: doc.path })!,
      fields: ({ defaultFields }) => [...defaultFields, alternatePathsField()],
    }),
  ],
})
```

### Environment variables

The following environment variables are required:

- `NEXT_PUBLIC_FRONTEND_URL`

## About this plugin

This plugin streamlines website development with Payload CMS by providing enhanced document nesting capabilities. While the official [Nested Docs plugin](https://payloadcms.com/docs/plugins/nested-docs) only supports nesting within a single collection, this plugin enables nesting documents across multiple collections. Another major difference is that this plugin uses virtual fields for the paths and breadcrumbs, ensuring these computed values stay automatically synchronized with your content structure.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
