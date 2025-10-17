# JHB Software - Payload Geocoding Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-geocoding-plugin)](https://www.npmjs.com/package/@jhb.software/payload-geocoding-plugin)

A geocoding plugin for Payload CMS that simplifies location management in your content. This plugin allows you to easily populate coordinates in a [Payload Point Field](https://payloadcms.com/docs/fields/point) by entering an address through an autocomplete interface powered by the Google Places API.

![Screenshot showing the added autocomplete select field](https://github.com/user-attachments/assets/13e0b9f8-dc69-47de-9691-384ebf1d0868)

## Setup

### Installation

Add the plugin to your payload config as follows:

```ts
plugins: [payloadGeocodingPlugin({})]
```

### Google Maps API Key

To use this plugin, you'll need a Google Maps API key. To get one, follow these steps:

1. Set up a Google Cloud account and create a project
2. Enable the Maps JavaScript API in your Google Cloud project
3. Create an API key with `Maps JavaScript API`,  `Places API` and `Geocoding API` access
4. Add the API key to your environment variables.

Note: Since this API key is exposed to the frontend (Payload Admin panel), it is strongly recommended to restrict its usage by setting up domain restrictions and only enabling the `Maps JavaScript API`, `Places API`, and `Geocoding API` in the Google Cloud Console under API Keys & Credentials

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

This will add a `location_googlePlacesData` JSON field to the collection. This field will store the raw geocoding data from the Google Places API.

If needed you can adjust the `location_googlePlacesData` field name by passing a `name` property to the `geocodingField` function.

```ts
geocodingField({
  pointField: {
    name: 'location',
    type: 'point',
  },
  geoDataFieldOverride: {
    label: 'JSON Geodata Field',
    access: {
      read: () => true,
      update: () => true,
      create: () => true,
    },
    admin: {
      readOnly: false,
      description: 'This field stores the geocoding data from the Google Places API.',
    },
  },
}),
```

## About this plugin

This plugin uses the [react-google-places-autocomplete](https://www.npmjs.com/package/react-google-places-autocomplete) library to provide a Select/Search input for finding an address. The result of the Google Places API request is stored in a JSON field and the coordinates are stored in a Point Field.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

- Use the native Payload `SelectField` instead of the field provided by `react-google-places-autocomplete`
- Extend the field config to accept `GooglePlacesAutocomplete` options like debounce time, API options, etc.
- Add support for other geocoding services (Mapbox, HERE, etc.)

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
