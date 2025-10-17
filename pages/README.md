# JHB Software - Payload Pages Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-pages-plugin)](https://www.npmjs.com/package/@jhb.software/payload-pages-plugin)

The Payload Pages plugin simplifies website building by adding essential fields to your collections. These fields enable hierarchical page structures and dynamic URL management.

## Setup

First, add the plugin to your payload config. The `generatePageURL` function is required and must provide a function that returns the full URL to the frontend page. 

```ts
import { payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'

// Add to plugins array
plugins: [
  payloadPagesPlugin({
      // Example generatePageURL function:
      generatePageURL: ({ path, preview }) =>
        path && process.env.NEXT_PUBLIC_FRONTEND_URL
          ? `${process.env.NEXT_PUBLIC_FRONTEND_URL}${preview ? '/preview' : ''}${path}`
          : null,
    }),
]
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

### SEO Plugin Integration

To integrate with the official Payload SEO plugin, store the `generatePageURL` function you defined for the pages plugin in a variable outside of the Payload config and pass it to the `generateURL` option of the SEO plugin. 
If your collections are localized, also add the `alternatePathsField` which is exported by the plugin to the fields option of the SEO plugin.

```ts
import { alternatePathsField, payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
import { seoPlugin } from '@payloadcms/plugin-seo'

// Example generatePageURL function:
const generatePageURL = ({ path, preview }: {
  path: string | null
  preview: boolean
}): string | null => {
  return path && process.env.NEXT_PUBLIC_FRONTEND_URL
    ? `${process.env.NEXT_PUBLIC_FRONTEND_URL}${preview ? '/preview' : ''}${path}`
    : null
}

export default buildConfig({
  // ...
  plugins: [
    payloadPagesPlugin({
      generatePageURL,
    }),
    seoPlugin({
      generateURL: ({ doc }) => generatePageURL({ path: doc.path, preview: false }),
      // If your collections are localized, also add the alternatePathsField
      fields: ({ defaultFields }) => [...defaultFields, alternatePathsField()],
    }),
  ],
})
```

### Multi-tenant support

> ⚠️ **Warning**: The multi-tenant support is currently experimental and may change in the future.

The plugin supports multi-tenant setups via the official [Multi-tenant plugin](https://payloadcms.com/docs/plugins/multi-tenant).

By default the plugin adds a unique constraint to the slug field of all page collections. In a multi-tenant setup you can disable this constraint by setting the `unique` field to `false` in the page collection config. To ensure uniqueness for a tenant to now have pages with multiple slugs, you can create a compound unique index.

Example:    

```ts
export const Pages: PageCollectionConfig = {
  slug: 'pages',
  page: {
    slug: {
      // Disable the slug uniqueness because of the multi-tenant setup (see indexes below)
      unique: false,
    },
  },
  indexes: [
    {
      fields: ['slug', 'tenant'],
      unique: true,
    },
  ],
  fields: [ /* your fields */],
} 
```

Some features (e.g. the parent and isRootPage fields) internally fetch documents from the database. To ensure only documents from the current tenant are fetched, you need to pass the `baseFilter` function to the plugin config. It receives the current request object and should return a `Where` object which will be added to the query.
For the validation of the redirects, you need to pass the `redirectValidationFilter` function to the plugin config. It receives the current request object and the document object and should return a `Where` object which will be added to the query.

To generate the URL based on the tenant the page belongs to, pass an async function to the `generatePageURL` option of the plugin config. It receives the current request object and document data so you could for example fetch the tenant from the database and use its website URL.

Example:

```ts
import { payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'


export default buildConfig({
  // ...
  plugins: [
    payloadPagesPlugin({
      generatePageURL: async ({ path, preview, data, req }) => {
        if (data.tenant && typeof data.tenant === 'string') {
          const tenant = await req.payload.findByID({
            collection: 'tenants',
            id: data.tenant,
            select: {
              websiteUrl: true,
            },
            req,
          })

          if (tenant && 'websiteUrl' in tenant && tenant.websiteUrl) {
            return `${tenant.websiteUrl}${preview ? '/preview' : ''}${path}`
          }
        }

        return null
      },
      baseFilter: ({ req }) => {
        const tenant = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)

        return { tenant: { equals: tenant } }
      },
      redirectValidationFilter: ({ doc }) => {
        return { tenant: { equals: doc.tenant } }
      },
    }),
  ],
})
```

### Parent Deletion Prevention

The plugin automatically prevents the deletion of parent documents that are referenced by child documents, protecting your data integrity and preventing orphaned references. This feature is enabled by default but can be disabled if needed.

#### Automatic Protection for MongoDB, SQLite, and PostgreSQL

When using MongoDB, SQLite, or PostgreSQL as your database adapter, the plugin includes a `beforeDelete` hook that:

- **Prevents deletion** of any document that serves as a parent to other documents
- **Checks all configured page collections** for references to the document being deleted
- **Supports multi-tenant environments** by respecting your `baseFilter` configuration
- **Provides clear error messages** indicating which child documents are preventing the deletion

This custom logic is necessary because these database adapters don't enforce foreign key constraints at the database level for Payload relationship fields.

#### Other Database Adapters

For other database adapters that may enforce referential integrity natively, the plugin's custom deletion prevention logic is automatically bypassed.

#### Error Messages

When attempting to delete a referenced parent document in MongoDB, SQLite, or PostgreSQL, you'll see a descriptive error message:

```
Cannot delete document: 3 child document(s) reference this document as their parent in collection 'pages'
```

#### Disabling Parent Deletion Prevention

If you need to allow deletion of parent documents regardless of child references, you can disable this protection:

```ts
plugins: [
  payloadPagesPlugin({
    preventParentDeletion: false
    // other options
  })
]
```

#### Resolving Deletion Conflicts

To delete a parent document that has child references, you have two options:

1. **Reassign child documents**: Update the child documents to reference a different parent
2. **Remove child documents**: Delete the child documents first, then delete the parent

Example of reassigning a child document:

```ts
// Update child document to reference a different parent
await payload.update({
  collection: 'pages',
  id: childDocumentId,
  data: {
    parent: newParentId, // or null to make it a root document
  },
})

// Now the original parent can be safely deleted
await payload.delete({
  collection: 'pages',
  id: originalParentId,
})
```

## About this plugin

This plugin streamlines website development with Payload CMS by providing enhanced document nesting capabilities. While the official [Nested Docs plugin](https://payloadcms.com/docs/plugins/nested-docs) only supports nesting within a single collection, this plugin enables nesting documents across multiple collections. Another major difference is that this plugin uses virtual fields for the paths and breadcrumbs, ensuring these computed values stay automatically synchronized with your content structure.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
