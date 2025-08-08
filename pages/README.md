# JHB Software - Payload Pages Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-pages-plugin)](https://www.npmjs.com/package/@jhb.software/payload-pages-plugin)

The Payload Pages plugin simplifies website building by adding essential fields to your collections. These fields enable hierarchical page structures and dynamic URL management.

## Setup

First, add the plugin to your payload config as follows:

```ts
plugins: [payloadPagesPlugin({})]
```

Next, create a page collections using the `PageCollectionConfig` type. This type extends Payload's `CollectionConfig` type with a `page` field that contains configurations for the page collection. The `page` field must be specified as follows:

- `parent.collection`: The slug of the collection that will be used as the parent of the current collection.
- `parent.name`: The name of the field on the parent collection that will be used to relate to the current collection.
- `isRootCollection`: Whether the collection is the root collection (collection which contains the root page). If true, the parent field is optional. Defaults to `false`.
- `parent.sharedDocument` (optional, defaults to `false`): If true, the parent document will be shared between all documents in the collection.
- `breadcrumbs.labelField` (optional, defaults to `admin.useAsTitle`): The name of the field that will be used to label the document in the breadcrumb.
- `slug.fallbackField` (optional, defaults to `title`): The name of the field that will be used as the fallback for the slug.

Here is an example of the page collection config of the root collection:

```ts
import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

const Pages: PageCollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
  },
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
    },
    isRootCollection: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    // other fields
  ],
}
```

Then additional collections can be created. Documents in these collections will be nested under documents in the root collection.

```ts
import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

const Posts: PageCollectionConfig = {
  slug: 'posts',
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
      sharedDocument: true,
    },
  },
  fields: [
    // your fields
  ],
}
```

The plugin also includes a `RedirectsCollectionConfig` type that can be used to create a redirects collection. This type extends Payload's `CollectionConfig` type with a `redirects` field that contains configurations for the redirects collection.

```ts
import { RedirectsCollectionConfig } from '@jhb.software/payload-pages-plugin'

const Redirects: RedirectsCollectionConfig = {
  slug: 'redirects',
  admin: {
    defaultColumns: ['sourcePath', 'destinationPath', 'permanent', 'createdAt'],
    listSearchableFields: ['sourcePath', 'destinationPath'],
  },
  redirects: {},
  fields: [
    // the fields are added by the plugin automatically
  ],
}
```

In order for the official payload SEO plugin to use the generated URL, you need to pass the `getPageUrl` function provided by this plugin to the `generateURL` field in the `seo` plugin config inside your payload config. 
If your collections are localized, you also need to pass the `alternatePathsField` field to the `fields` array.

```ts
import { alternatePathsField, getPageUrl } from '@jhb.software/payload-pages-plugin'

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
