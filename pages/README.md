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

### Nesting under more than one collection

`page.parent.collection` also accepts a list of collection slugs, so a collection can nest under itself **and** under other page collections at the same time. This is what routes an e-commerce category tree off a page — `/shop` (page) → `/shop/mens` (topic) → `/shop/mens/shirts` (topic):

```ts
const Topics: PageCollectionConfig = {
  slug: 'topics',
  page: {
    parent: {
      collection: ['pages', 'topics'],
      name: 'parent',
    },
    // Siblings under different parents may share a slug. The default collection-wide
    // constraint would reject /shop/womens/shirts next to /shop/mens/shirts.
    slug: { unique: false },
  },
  fields: [/* ... */],
}
```

Every slug in the list must name a collection which itself has a `page` config; the plugin throws at startup otherwise. A collection using `parent.sharedDocument` may not list its own slug, because a shared parent and a nestable tree contradict each other.

A single slug keeps today's behaviour exactly: the field stays monomorphic and stores a bare id. A list makes it polymorphic, storing `{ relationTo, value }` — including a single-element list, which Payload treats as polymorphic too. Declaring `['pages']` up front therefore adopts the polymorphic layout immediately and spares a migration when further slugs are added later.

#### Migrating an existing collection to a list

Switching a collection from a slug to a list is a **storage change**, and the plugin cannot automate it: it cannot know which collections changed shape, and on SQL adapters the copy has to run inside the generated migration, between creating the `_rels` rows and dropping the old column.

Postgres — in the generated migration, **before** `DROP COLUMN parent_id`:

```sql
INSERT INTO topics_rels (parent_id, path, pages_id)
SELECT id, 'parent', parent_id FROM topics WHERE parent_id IS NOT NULL;
```

MongoDB — no schema step; run once before deploying:

```js
db.topics.updateMany({ parent: { $type: 'objectId' } }, [
  { $set: { parent: { relationTo: 'pages', value: '$parent' } } },
])
```

A row left behind by an incomplete migration holds a bare id in a field which no longer says which collection it points at. Such a value is refused with a validation error on save and logged as an error on read (the document is returned without `path` and `breadcrumbs`), rather than being treated as "no parent" — an unmigrated document stays visibly broken instead of silently dropping out of the page tree.

### Customizing the generated fields

The `slug`, `parent`, `path`, `breadcrumbs` and `isRootPage` fields are generated by the plugin, so their admin config cannot be set in the collection's `fields` array. Pass an `admin` object in the matching `page` block instead. It is deep merged over the plugin's own, so a single nested key can be replaced without losing the rest:

```ts
const Blogposts: PageCollectionConfig = {
  slug: 'blogposts',
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
      sharedDocument: true,
      admin: { description: 'All blog posts hang under the same blog index page.' },
    },
    path: { admin: { disableListColumn: true } },
  },
  fields: [/* ... */],
}
```

The `parent` field also accepts `filterOptions`, to constrain where documents of a collection may be attached in the page tree:

```ts
page: {
  parent: {
    collection: 'pages',
    name: 'parent',
    filterOptions: { systemRole: { equals: 'category-index' } },
    admin: { description: 'Categories live under the shop’s Collections page.' },
  },
}
```

Two keys compose with the plugin's instead of replacing it:

- **`admin.condition`** is ANDed with the plugin's (the parent field is hidden on the root page), so an override can only hide the field in more cases, never reveal it in fewer.
- **`parent.filterOptions`** is ANDed with the plugin's, which excludes the current document from its own parents. Payload re-runs `filterOptions` on save, so this holds REST and local API writes too, not just the admin picker.

Every other key replaces the plugin's. Two of them do less than expected:

- `slug` and `path` are rendered by the plugin's own components, which ignore `description`, `readOnly` and `placeholder`. Replace `components.Field` to change how those two look.
- `admin.hidden` on `parent` hides a field which is `required` for every non-root collection, so only combine it with `sharedDocument: true`.

Two caveats when hiding `path`:

- `admin.hidden` removes the field from the admin entirely, which unmounts `PathField` — the only component that keeps the `breadcrumbs` form state in sync while the slug or parent is edited. The breadcrumbs modal then shows stale crumbs, and the slug field's "Create Redirect" button, which derives both paths from the parent breadcrumbs, computes the wrong new path if the parent changed in the same session. A plain slug rename is unaffected. To hide the field but keep it mounted, point `components.Field` at a wrapper that renders `PathField` inside a hidden element.
- Prefer either over `admin.condition`: Payload's type generation marks conditionally-rendered fields optional, degrading `path` to `string | null | undefined` for every consumer.

### SEO Plugin Integration

To integrate with the official Payload SEO plugin, store the `generatePageURL` function you defined for the pages plugin in a variable outside of the Payload config and pass it to the `generateURL` option of the SEO plugin.
If your collections are localized, also add the `alternatePathsField` which is exported by the plugin to the fields option of the SEO plugin.

```ts
import { alternatePathsField, payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
import { seoPlugin } from '@payloadcms/plugin-seo'

// Example generatePageURL function:
const generatePageURL = ({
  path,
  preview,
}: {
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
  fields: [/* your fields */],
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

The plugin automatically prevents the deletion of parent documents that are referenced by child documents, protecting your data integrity and preventing orphaned references. This feature is enabled by default but can be disabled by setting the `preventParentDeletion` plugin config option to `false` if needed.

#### Resolving Deletion Conflicts

To delete a parent document that has child references, you have two options:

1. **Reassign child documents**: Update the child documents to reference a different parent
2. **Remove child documents**: Delete the child documents first, then delete the parent

#### Deleting a Whole Subtree

A teardown which removes a parent together with all of its descendants cannot orphan anything, so the guard has nothing to protect there. Instead of ordering the deletes leaf-first, opt out per request with `SKIP_PARENT_GUARD_CONTEXT_KEY`:

```ts
import { SKIP_PARENT_GUARD_CONTEXT_KEY } from '@jhb.software/payload-pages-plugin'

const skipParentGuard = { [SKIP_PARENT_GUARD_CONTEXT_KEY]: true }

await payload.delete({ collection: 'pages', id: subtreeRootId, context: skipParentGuard })
await payload.delete({
  collection: 'pages',
  where: { parent: { equals: subtreeRootId } },
  context: skipParentGuard,
})
```

The key disables both the permanent-delete and the trash guard, and it applies to the request it is set on — every delete and trash operation sharing that request skips the guard, not only the subtree that motivated it. The admin panel never sets it, so editors keep the full protection.

#### Trashed Documents

On a collection with [`trash: true`](https://payloadcms.com/docs/trash/overview), moving a parent to the trash is refused just like a permanent delete. Payload excludes trashed documents from reads, so a trashed parent is invisible to the ancestor lookup and its children lose their `path` and `breadcrumbs` entirely.

Trashed children still count as references, because they carry a live parent id until they are permanently deleted. Restoring a document is never blocked.

Parents trashed before this guard existed left children behind. List the trashed parents of a collection and restore or reassign the children referencing them:

```ts
const trashedParents = await payload.find({
  collection: 'pages',
  trash: true,
  where: { deletedAt: { exists: true } },
})

for (const parent of trashedParents.docs) {
  const orphans = await payload.find({
    collection: 'pages', // repeat for every collection whose page.parent points at 'pages'
    trash: true,
    where: { parent: { equals: parent.id } },
  })

  console.log(
    parent.id,
    orphans.docs.map((doc) => doc.id),
  )
}
```

### Payload Select API

When using the [Payload Select API](https://payloadcms.com/docs/queries/select), the plugin automatically extends the selection to include all virtual fields if any of them are selected. This ensures that virtual fields can be generated correctly.
For example, when querying for a page and selecting only the `path` field, the plugin will also select the `slug`, `parent` and `title` fields as theses fields are required to generate the virtual `path` field.

Therefore it is highly recommended to specify the [defaultPopulate](https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property) property on all of your page collections.

## Fetching pages by path

Because the `path` field is virtual, it cannot be queried in the database directly. The plugin exports `findPageByPath`, which resolves a path to the page it belongs to across all page collections:

```ts
import { findPageByPath } from '@jhb.software/payload-pages-plugin'

// Returns the full page document (e.g. for rendering a frontend page):
const result = await findPageByPath({ payload, path: '/de/blog/my-post', depth: 1 })
// result: { collection: 'blogposts', doc: { id: '...', path: '/de/blog/my-post', ... } } | null

// Identity only (e.g. for a page-props endpoint whose caller fetches the document itself,
// via GraphQL or a different field selection): pass depth 0 and an empty select.
const identity = await findPageByPath({ payload, path: '/de/blog/my-post', depth: 0, select: {} })
// identity: { collection: 'blogposts', doc: { id: '...', path: '/de/blog/my-post' } } | null
```

`findPageByPath` accepts either a `payload` instance or a `req` (which forwards the active transaction and user), the query options `depth`, `select` and `populate`, and:

- `locale`: The locale to resolve the path in. Defaults to the locale prefix of the path (e.g. `/de/...`), falling back to the default locale.
- `draft`: Whether to resolve draft documents (default `false`). Published lookups never return unpublished pages.
- `where`: An additional filter applied on top of the plugin's configured `baseFilter`. The filtered fields must be queryable on every page collection.
- `overrideAccess` / `cache` / `waitUntil` / `onCacheResult`: See below.

The plugin's [`baseFilter`](#multi-tenant-support) is applied to the lookup automatically, so multi-tenant setups are scoped to the correct tenant without passing `where`. Because `baseFilter` is evaluated against the request, such setups must call `findPageByPath` with `req` (rather than `payload`); a lookup without `req` throws when a `baseFilter` is configured. Both the base filter and `where` are part of the cache key, so differently scoped lookups never share cache entries.

### Path lookup caching

Resolving a path requires scanning the page collections for documents whose slug matches the last path segment and comparing their computed paths. To avoid this scan on repeated lookups, `findPageByPath` caches successful path→document-id resolutions in [Payload's KV store](https://payloadcms.com/docs/kv-store/overview) (`payload.kv`). A cache hit replaces the scan with a single fetch by id.

Note that the KV store's default adapter (`databaseKVAdapter`) stores its entries in a `payload-kv` collection, so reading the cache is itself a database round trip — a hit saves the scan, but not the trip to the database. Frontends which resolve a path on every request should configure a faster adapter through the `kv` option of the Payload config, e.g. `redisKVAdapter` from `@payloadcms/kv-redis`, or `inMemoryKVAdapter` from `payload` for a single long-lived process:

```ts
import { redisKVAdapter } from '@payloadcms/kv-redis'

export default buildConfig({
  // ...
  kv: redisKVAdapter({ redisURL: process.env.REDIS_URL }),
})
```

The cache never requires manual invalidation: every cached mapping is verified against the requested path on read. If the page was renamed, moved, unpublished or deleted in the meantime, the stale entry is deleted and the lookup transparently falls back to the scan.

Draft and published lookups (`draft: true`) are cached under separate keys, so an unpublished change never leaks into a published lookup and vice versa. Because the cache only maps a path to a document id and the document is re-fetched on every lookup, draft content changes are always reflected without invalidating the cached path — so a preview that re-renders on every edit still benefits from the cache as long as the page's path stays the same.

Caching is enabled by default and can be disabled per call:

```ts
await findPageByPath({ payload, path, cache: false })
```

Cache maintenance writes (the write-back after a scan, the deletion of stale entries) never affect the resolved document, but by default the lookup waits for them. Pass `waitUntil` to defer them off the critical path — on serverless runtimes, pass the platform's scheduler (`waitUntil` from `@vercel/functions` on Vercel, `ctx.waitUntil.bind(ctx)` on Cloudflare Workers) so deferred writes aren't cancelled when the response ends. Failures of deferred writes are swallowed; a lost write only means the next lookup falls back to the scan.

To log or count cache effectiveness, pass `onCacheResult` — called once per lookup with the `status` (`hit`, `stale` or `miss`), the normalized `path` and the `cacheKey` (never called with `cache: false`):

```ts
import { waitUntil } from '@vercel/functions'

await findPageByPath({
  payload,
  path,
  waitUntil,
  onCacheResult: ({ status, path }) => console.log(`path cache ${status}: ${path}`),
})
```

After bulk operations which change many paths at once (e.g. imports or migrations), the cache can be reset with `clearPathCache(payload)` — this is an optimization, not a correctness requirement, as stale entries heal themselves on read.

## Enumerating page paths

> ⚠️ `listPagePaths` and `pathChanges` are **experimental**: they may change or be removed in a future minor release without a breaking-change bump. They need more real-world testing before being marked stable.

`listPagePaths` enumerates every live path across the plugin's page collections — published, not trashed, and scoped by the plugin's [`baseFilter`](#multi-tenant-support). It returns data, not XML: sitemap, `robots.txt` and `llms.txt` serialization stay with the caller, as do indexability rules (pass a noindex filter through `where` on the sitemap call only).

```ts
import { listPagePaths } from '@jhb.software/payload-pages-plugin'

const entries = await listPagePaths({ req })
// entries: [{ collection: 'pages', id: '...', locale: 'de', path: '/de/blog/my-post', title: 'My Post', updatedAt: '...' }, ...]

const sitemap = entries.map(({ path, updatedAt }) => ({
  loc: `${origin}${path}`,
  lastmod: updatedAt,
}))
```

On a localized install the result carries one entry per (document, locale); a locale whose slug is unset yields no entry. On an unlocalized install `locale` is absent from every entry. `title` carries the value of each collection's `breadcrumbs.labelField`. Options:

- `collections`: The page collections to enumerate. Defaults to every registered page collection, so a newly added page collection appears without a code change.
- `locale`: Narrows a localized install to one locale.
- `draft`: Whether to enumerate the latest versions instead of the published ones (default `false`), mirroring `findPageByPath`.
- `where`: An additional filter, merged per collection with `and` — it can narrow the enumeration but never widen it past the plugin's own conditions. The filtered fields must be queryable on every enumerated collection. On a localized install the default enumeration queries all locales at once, where Payload cannot filter on localized fields — filter on unlocalized fields, or pass `locale` to filter on localized ones.

The queries run with access control overridden (the Local API default): entries are scoped by liveness and the `baseFilter`, not by the request user's read access. This fits a sitemap or llms.txt; do not use the result to render navigation for a user whose read access is narrower.

## Reacting to path changes

`pathChanges` reports which live paths a write started or stopped resolving — for the written document and, when a live path moved, for every descendant whose path moved with it. Call it from a page collection's own `afterChange` and `afterDelete` hooks with the hook's arguments:

```ts
import { pathChanges } from '@jhb.software/payload-pages-plugin'

// in a page collection's own hooks
hooks: {
  afterChange: [
    async (args) => {
      for (const change of await pathChanges(args)) {
        await revalidate(change.previousPath, change.path)
      }
    },
  ],
}
```

Each entry carries `previousPath` (the live path before the write, `null` when it did not resolve) and `path` (the live path after it, `null` when it no longer resolves), so the three cases a consumer acts on fall out of the two nullable strings: `null → '/x'` (created, published, restored — warm it), `'/x' → null` (deleted, trashed, unpublished — purge it), `'/x' → '/y'` (moved — purge old, warm new).

A draft save or autosave tick reports no changes. A rename staged in a draft is reported when it is published, carrying the previously published path as `previousPath` — which the hook's `previousDoc` cannot supply, since on a drafts-enabled collection it holds the latest version rather than the published state.

`pathChanges` rejects rather than returning a short list: a silently incomplete purge is worse than a loud failure. Await it inside the hook as above, or chain `.catch()` when running it off the critical path:

```ts
afterChange: [
  (args) =>
    void pathChanges(args)
      .then(invalidate)
      .catch((error) => args.req.payload.logger.error(error)),
]
```

## Identifying page collections

`isPageCollectionConfig` (also experimental) is the plugin's own predicate for "is this collection config a page collection". It works on the raw config — before the plugin transforms it — so it can derive the page collection slugs at config-build time, e.g. to configure a rich-text link feature or a page picker:

```ts
import { isPageCollectionConfig } from '@jhb.software/payload-pages-plugin'

const pageSlugs = collections.filter(isPageCollectionConfig).map((collection) => collection.slug)
```

## About this plugin

This plugin streamlines website development with Payload CMS by providing enhanced document nesting capabilities. While the official [Nested Docs plugin](https://payloadcms.com/docs/plugins/nested-docs) only supports nesting within a single collection, this plugin enables nesting documents across multiple collections. Another major difference is that this plugin uses virtual fields for the paths and breadcrumbs, ensuring these computed values stay automatically synchronized with your content structure.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
