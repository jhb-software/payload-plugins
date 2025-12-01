# JHB Software - Payload Admin Search Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-admin-search)](https://www.npmjs.com/package/@jhb.software/payload-admin-search)

A plugin for [Payload CMS](https://payloadcms.com) that adds a search modal to quickly find documents across collections in the admin panel.

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
    }),
  ],
}
```

You can control which collections you can search by adjusting the `collections` option in the search plugin config.

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
