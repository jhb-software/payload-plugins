# JHB Software - Payload Admin Search Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-admin-search)](https://www.npmjs.com/package/@jhb.software/payload-admin-search)

A plugin that adds a global search modal to the Payload CMS admin panel, enabling quick navigation across documents and collections with keyboard shortcuts.

## Features

- Global search modal triggered by `Cmd + K` / `Ctrl + K`
- Search across collections in your Payload admin panel
- Quickly open collections and globals by name
- Search index powered by [@payloadcms/plugin-search](https://www.npmjs.com/package/@payloadcms/plugin-search)
- Real time search results
- Keyboard navigation support
- Configurable search component styles (button or bar)
- Clean, minimal UI

## Setup

This plugin requires the official [Payload search plugin](https://payloadcms.com/docs/plugins/search) to be installed. To use this plugin, simply install it and add it to your Payload config.

```ts
import { adminSearchPlugin } from '@jhb.software/payload-admin-search'
import { searchPlugin } from '@payloadcms/plugin-search'

export default {
  plugins: [
    adminSearchPlugin({}),
    searchPlugin({
      collections: ['pages', 'posts', 'authors'],
      // The index is exposed at GET /api/search — set its access to match who should read it (see Security).
      searchOverrides: {
        access: {
          read: ({ req }) => Boolean(req.user),
        },
      },
    }),
  ],
}
```

You can control which collections you can search by adjusting the `collections` option in the search plugin config.

## Security

Search results are served by the `search` collection from [@payloadcms/plugin-search](https://www.npmjs.com/package/@payloadcms/plugin-search), exposed at `GET /api/search`. Two things to be aware of when deciding its access:

- **It is public by default** (`read: () => true`): the titles and IDs of every indexed document are readable by anyone. If that doesn't fit your app, set `searchOverrides.access.read` — e.g. `({ req }) => Boolean(req.user)` for admin-only, or leave it open if your frontend reads the index.
- **Its read access is coarse:** the collection flattens documents from every configured collection into one and does not inherit per-collection access control. To limit which documents a user sees, return a `where` constraint from `searchOverrides.access.read`. This can only be done server-side — the admin UI shows whatever the endpoint returns.

## Configuration

The plugin accepts the following configuration options:

### `enabled`

- **Type**: `boolean`
- **Default**: `true`

### `headerSearchComponentStyle`

- **Type**: `'button' | 'bar'`
- **Default**: `'button'`
- **Description**: Choose the style of the search component in the admin header

#### Button Style (Default)

The default button style shows a compact search button with "Search" text and keyboard shortcut:

```ts
adminSearchPlugin({
  headerSearchComponentStyle: 'button', // or omit for default
})
```

#### Bar Style

The bar style shows a full search input bar similar to modern search interfaces:

```ts
adminSearchPlugin({
  headerSearchComponentStyle: 'bar',
})
```

### `baseFilter`

- **Type**: `({ req }) => Where | Promise<Where>`
- **Default**: none
- **Description**: Restricts document results to a constraint resolved against the current request. The filter runs on the server, and its result is combined with the typed query using `and` — so results stay in scope even before anything is typed.

`req` is the request the admin panel is being rendered for, so it carries the incoming cookies, the signed-in user and the locale currently being viewed.

The main use is multi-tenancy: scope the search to the tenant selected in the admin panel, whose id [@payloadcms/plugin-multi-tenant](https://payloadcms.com/docs/plugins/multi-tenant) keeps in the `payload-tenant` cookie.

```ts
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import type { Where } from 'payload'

adminSearchPlugin({
  // Annotate the return type: without it TypeScript infers a union across the branches, and
  // `{}` widens to `{ or?: undefined }`, which `Where`'s index signature rejects.
  baseFilter: ({ req }): Where => {
    const tenant = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)

    // Returning `{}` leaves the search unscoped. Constraining `tenant` to `null` instead
    // would match nothing whenever no tenant is selected.
    if (!tenant) {
      return {}
    }

    // The `exists: false` branch keeps documents that carry no tenant at all. Without it,
    // selecting a tenant hides every indexed collection the multi-tenant plugin does not
    // scope — shared media, authors and the like vanish from the search.
    return { or: [{ tenant: { equals: tenant } }, { tenant: { exists: false } }] }
  },
})
```

Note the `or`. A filter of just `{ tenant: { equals: tenant } }` restricts results to documents that carry the selected tenant, which also removes every document that has no tenant — search indexes are usually wider than the set of tenant-scoped collections, so those documents disappear the moment a tenant is picked. Include the un-tenanted ones explicitly unless hiding them is what you want.

The `search` collection must carry the field the filter constrains, which means adding it in `searchOverrides` and populating it in `beforeSync`:

```ts
searchPlugin({
  searchOverrides: {
    fields: ({ defaultFields }) => [
      ...defaultFields,
      { name: 'tenant', type: 'relationship', index: true, relationTo: 'tenants' },
    ],
  },
  beforeSync: ({ originalDoc, searchDoc }) => ({
    ...searchDoc,
    tenant: originalDoc.tenant ?? null,
  }),
})
```

> **This scopes what the search offers, not what the API permits.** The filter narrows the query the admin UI sends; it is not access control. Anyone who can read `GET /api/search` directly still sees whatever that endpoint returns — see [Security](#security) for constraining it server-side via `searchOverrides.access.read`.

Two consequences of the filter being resolved on the server and applied by the client:

- The resolved constraint is serialized into the page and readable in the browser's devtools. Keep anything secret out of the `Where` it returns.
- Only the component the plugin mounts (`@jhb.software/payload-admin-search/rsc#SearchWrapper`) resolves the filter. Mounting `@jhb.software/payload-admin-search/client#SearchWrapperClient` by hand gives an unscoped search, with no warning.

#### When the filter cannot be evaluated

If the filter throws or rejects, the error is logged and the search returns no results at all, showing its error state. It does not fall back to an unscoped search: the whole point of the filter is to keep documents out of the list, so widening on failure would expose exactly what it was meant to hide. The admin panel itself keeps rendering — only the search is affected.

#### Cost

The filter is evaluated during the server render of **every admin page**, not when the search is opened: the constraint has to be on the page before the modal can query anything. There is no cheaper hook that still sees the request, so keep the filter cheap.

- Reading `req.headers` cookies or `req.user` — as in the example above — costs nothing measurable.
- A filter that queries the database adds that query to every admin page load, and because it is awaited during the render, a slow one delays the page. Cache the lookup if you need one.
- Leaving `baseFilter` unset costs nothing: nothing is resolved and nothing is passed to the client.

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
