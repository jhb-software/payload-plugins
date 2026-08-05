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

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
