# JHB Software - Payload Geocoding Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-geocoding-plugin)](https://www.npmjs.com/package/@jhb.software/payload-geocoding-plugin)

A geocoding plugin for Payload CMS that simplifies location management in your content. This plugin allows you to easily populate coordinates in a [Payload Point Field](https://payloadcms.com/docs/fields/point) by entering an address through an autocomplete interface powered by the Google Places API.

![Screenshot showing the added autocomplete select field](https://github.com/user-attachments/assets/13e0b9f8-dc69-47de-9691-384ebf1d0868)

## Setup

### Installation

Add the plugin to your payload config:

```ts
plugins: [
  payloadGeocodingPlugin({
    // Browser key for the address autocomplete in the admin panel.
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    // Server key for server-side geocoding. Defaults to googleMapsApiKey.
    googleServerApiKey: process.env.GOOGLE_MAPS_API_KEY,
  }),
]
```

| Option               | Description                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `googleMapsApiKey`   | Key for the admin autocomplete (Maps JavaScript API, Places API (New)). Required to render `geocodingField`. |
| `googleServerApiKey` | Key for server-side geocoding (Geocoding API). Defaults to `googleMapsApiKey`.                               |
| `geocoder`           | Replaces the bundled Google geocoder for server-side geocoding, see [Other providers](#other-providers).     |
| `access`             | Who may call the search endpoint. Defaults to `({ req }) => Boolean(req.user)`.                              |
| `enabled`            | Set to `false` to disable the plugin.                                                                        |

### Google Maps API keys

1. Set up a Google Cloud account and create a project.
2. Enable the **Maps JavaScript API**, the **Places API (New)** and the **Geocoding API**.
3. Create two keys:
   - a **browser key** (`googleMapsApiKey`) restricted by HTTP referrer to your admin domain, since it is sent to the browser
   - a **server key** (`googleServerApiKey`) restricted by IP address or to the Geocoding API. Google refuses referrer-restricted keys for server-side requests, which send no referrer.

A single unrestricted key works for both, but exposes server-side quota to anyone who reads the admin page.

## Usage

Wrap a point field with `geocodingField`:

```ts
geocodingField({
  pointField: {
    name: 'location',
    type: 'point',
  },
})
```

This adds two fields next to the point:

- `location_meta`, a JSON field holding the selected place: `name`, `formattedAddress`, `googlePlaceId`, `types`, and for server-side geocoding also `precision`, `partialMatch` and the geocoded `query`. In the admin panel it renders as an address autocomplete that fills both fields.
- `location_address`, a hidden virtual text field for server-side geocoding (see below).

Customize the meta field with `locationMetaOverride`:

```ts
geocodingField({
  pointField: { name: 'location', type: 'point' },
  locationMetaOverride: {
    label: 'Location Metadata',
    admin: { readOnly: false },
  },
})
```

### Fill the point from the document's address

When the document already has address fields, the `address` option geocodes them on save, so nobody has to look up coordinates:

```ts
geocodingField({
  pointField: { name: 'coordinates', type: 'point', required: true },
  address: ({ siblingData }) =>
    siblingData.street && siblingData.city
      ? { address: `${siblingData.street}, ${siblingData.city}`, country: siblingData.country }
      : undefined,
  minPrecision: 'interpolated',
})
```

| Situation on save                                              | Result                                 |
| -------------------------------------------------------------- | -------------------------------------- |
| The point is empty and the address is complete                 | The point is geocoded                  |
| The caller sets the point                                      | The point is kept; nothing is geocoded |
| The address changes and the stored point came from geocoding   | The point is geocoded again            |
| The address changes and the stored point was entered or picked | The point is kept                      |
| No match, a match below `minPrecision`, or the provider failed | The point stays empty (see below)      |

Pass `country` (ISO 3166-1 alpha-2) whenever it is known: without it, a street name that exists in several countries can resolve to the wrong one. The language defaults to the request locale.

`minPrecision` is the least exact result the field stores: `exact` (building), `interpolated` (between house numbers), `center` (street or area center) or `approximate` (city, postal code; the default). Anything stricter than `approximate` also refuses partial matches.

When geocoding yields no usable point and the point is required, the save fails with the reason as the field's error, e.g. _Could not geocode "Hauptstraße 999, Berlin" exactly enough: the best match "Hauptstraße, 10827 Berlin, Germany" is a partial match, and this field needs interpolated. Add the house number or postal code, or set the coordinates directly._

## Usage with AI agents and the API

The admin autocomplete needs a browser. Agents and API clients have three server-side ways in.

### Send an address with the document

Every `geocodingField` has a hidden virtual `{name}_address` field. An address sent there is geocoded on save into the point and meta fields:

```bash
POST /api/pages
{ "title": "My Page", "location_address": "Alexanderplatz 1, 10178 Berlin" }
```

This is an explicit request, so it replaces the point, and a failed lookup refuses the save whether or not the point is required. The error names the reason and what to do:

```json
{
  "errors": [
    {
      "name": "ValidationError",
      "data": {
        "errors": [
          {
            "path": "location",
            "message": "Could not geocode \"Nowhere 99\": No place matches \"Nowhere 99\". Check the spelling, or add the postal code, city or country."
          }
        ]
      }
    }
  ]
}
```

### Search for an address

`GET /api/geocoding/search?q=<address>&country=<ISO code>&language=<code>` answers the matches, best first:

```json
{
  "results": [
    {
      "name": "Alexanderplatz 1",
      "formattedAddress": "Alexanderplatz 1, 10178 Berlin, Germany",
      "location": { "lat": 52.5219, "lng": 13.4132 },
      "placeId": "ChIJp1l4uWBRqEcR2SPNRBMhtAI",
      "precision": "exact",
      "partialMatch": false,
      "types": ["street_address"]
    }
  ]
}
```

No match answers `{ "results": [], "message": "..." }`. Other failures answer an error status with `{ "errors": [{ "message" }], "reason" }`, where `reason` is one of `invalid_request` (400), `not_configured` (501), `denied` (502), `quota` or `unavailable` (503).

A point field stores `[longitude, latitude]`, so write a result as `[location.lng, location.lat]`.

### Geocode in your own code

`geocode()` uses the configured geocoder and never throws:

```ts
import { geocode } from '@jhb.software/payload-geocoding-plugin'

const outcome = await geocode({ req, address: 'Alexanderplatz 1, Berlin', country: 'DE' })
if (outcome.ok) {
  const { lat, lng } = outcome.results[0].location
} else {
  req.payload.logger.warn(outcome.message) // outcome.reason says why
}
```

Identical queries within one request share one provider call.

### Other providers

Any function of type `Geocoder` replaces Google for server-side geocoding. It answers `{ ok: true, results }` or `{ ok: false, reason, message }`:

```ts
import type { Geocoder } from '@jhb.software/payload-geocoding-plugin'

const myGeocoder: Geocoder = async ({ address, country, language }) => {
  // call the provider, map its answer to GeocodingResult[]
}

payloadGeocodingPlugin({ googleMapsApiKey, geocoder: myGeocoder })
```

Check the provider's terms for how long you may store its results: some providers only allow caching geocoded coordinates temporarily.

## About this plugin

This plugin uses the Google Maps Places API (New) `AutocompleteSuggestion` API to provide a search input for finding an address. The selected location's metadata is stored in a JSON field and the coordinates are stored in a Point Field.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

- Extend the field config to accept options like debounce time, API options, etc.
- Bundle geocoders for other providers (Mapbox, HERE, etc.)

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
