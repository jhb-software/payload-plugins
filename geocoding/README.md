# JHB Software - Payload Geocoding Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-geocoding-plugin)](https://www.npmjs.com/package/@jhb.software/payload-geocoding-plugin)

A geocoding plugin for Payload CMS that simplifies location management in your content. This plugin allows you to easily populate coordinates in a [Payload Point Field](https://payloadcms.com/docs/fields/point) by entering an address through an autocomplete interface powered by the Google Places API.

![Screenshot showing the added autocomplete select field](https://github.com/user-attachments/assets/13e0b9f8-dc69-47de-9691-384ebf1d0868)

## Setup

### Installation

Add the plugin to your payload config with your Google Maps API key:

```ts
plugins: [
  payloadGeocodingPlugin({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  })
]
```

### Google Maps API Key

To use this plugin, you'll need a Google Maps API key. To get one, follow these steps:

1. Set up a Google Cloud account and create a project
2. Enable the **Maps JavaScript API** and the **Places API (New)** in your Google Cloud project
3. Create an API key with access to these APIs
4. Pass the API key to the plugin configuration (as shown above).

Note: Since this API key is exposed to the frontend (Payload Admin panel), it is strongly recommended to restrict its usage by setting up domain restrictions in the Google Cloud Console under API Keys & Credentials.

## Usage

To add geocoding functionality to a point field, you can simply wrap the point field with the `geocodingField` function:

```ts
geocodingField({
  pointField: {
    name: 'location',
    type: 'point',
  },
})
```

This will add a `location_meta` JSON field to the collection that stores metadata about the selected location (display name, formatted address, and Google Place ID (`googlePlaceId`)).

You can customize the metadata field by passing a `locationMetaOverride` option:

```ts
geocodingField({
  pointField: {
    name: 'location',
    type: 'point',
  },
  locationMetaOverride: {
    label: 'Location Metadata',
    access: {
      read: () => true,
      update: () => true,
      create: () => true,
    },
    admin: {
      readOnly: false,
    },
  },
}),
```

## About this plugin

This plugin uses the Google Maps Places API (New) `AutocompleteSuggestion` API to provide a search input for finding an address. The selected location's metadata is stored in a JSON field and the coordinates are stored in a Point Field.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

- Extend the field config to accept options like debounce time, API options, etc.
- Add support for other geocoding services (Mapbox, HERE, etc.)

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
