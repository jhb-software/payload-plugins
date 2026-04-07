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

## Usage with AI Agents / API

The default UI-based autocomplete requires a browser, which makes it unusable for AI agents and other API consumers. The plugin provides two server-side mechanisms to solve this.

### Geocoding Search Endpoint

The plugin registers a `GET /api/geocoding-plugin/search` endpoint that geocodes addresses server-side. It is authenticated by default (requires a logged-in user), and supports a custom access function:

```ts
plugins: [
  payloadGeocodingPlugin({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    // Optional: customize who can access the endpoint
    geocodingEndpoint: {
      access: ({ req }) => Boolean(req.user),
    },
  }),
]
```

An agent can then search for locations and use the results to populate fields:

```bash
# 1. Search for an address
GET /api/geocoding-plugin/search?q=Alexanderplatz,+Berlin

# Response:
{
  "results": [
    {
      "name": "Alexanderplatz",
      "formattedAddress": "Alexanderplatz, 10178 Berlin, Germany",
      "googlePlaceId": "ChIJp1l4uWBRqEcR2SPNRBMhtAI",
      "location": { "lat": 52.5219, "lng": 13.4132 },
      "types": [...]
    }
  ]
}

# 2. Use the result to create/update a document
POST /api/pages
{
  "title": "My Page",
  "location": [13.4132, 52.5219],
  "location_meta": {
    "name": "Alexanderplatz",
    "formattedAddress": "Alexanderplatz, 10178 Berlin, Germany",
    "googlePlaceId": "ChIJp1l4uWBRqEcR2SPNRBMhtAI",
    "types": ["point_of_interest", "establishment"]
  }
}
```

### Server-Side Address Geocoding (beforeChange Hook)

Every `geocodingField` automatically includes a hidden `{fieldName}_address` text field. When an address string is submitted via the API, a `beforeChange` hook geocodes it server-side and populates the point and meta fields.

An agent can simply submit an address string — the coordinates and metadata are resolved automatically:

```bash
POST /api/pages
{
  "title": "My Page",
  "location_address": "Alexanderplatz, Berlin"
}
```

The hook geocodes the address, sets the `location` point field to `[lng, lat]`, and populates `location_meta` with the location metadata.

## About this plugin

This plugin uses the Google Maps Places API (New) `AutocompleteSuggestion` API to provide a search input for finding an address. The selected location's metadata is stored in a JSON field and the coordinates are stored in a Point Field.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

- Extend the field config to accept options like debounce time, API options, etc.
- Add support for other geocoding services (Mapbox, HERE, etc.)

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
