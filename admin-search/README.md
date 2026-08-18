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

The main use is multi-tenancy: scope the search to the tenant selected in the admin panel, whose id [@payloadcms/plugin-multi-tenant](https://payloadcms.com/docs/plugins/multi-tenant) keeps in the `payload-tenant` cookie.

```ts
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'

adminSearchPlugin({
  baseFilter: ({ req }) => {
    const tenant = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)

    // Returning `{}` leaves the search unscoped. Constraining `tenant` to `null` instead
    // would match nothing whenever no tenant is selected.
    return tenant ? { tenant: { equals: tenant } } : {}
  },
})
```

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

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
