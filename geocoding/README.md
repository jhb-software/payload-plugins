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
    // Server key for server-side geocoding (agents, API clients, the `address` option).
    googleServerApiKey: process.env.GOOGLE_MAPS_API_KEY,
  }),
]
```

| Option               | Description                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `googleMapsApiKey`   | Key for the admin address search (Maps JavaScript API, Places API (New)). Without it the field shows the stored place read-only.    |
| `googleServerApiKey` | Key for server-side geocoding (Geocoding API). Without it (and without `geocoder`), server-side geocoding answers `not_configured`. |
| `geocoder`           | Replaces the bundled Google geocoder for server-side geocoding, see [Other providers](#other-providers).                            |
| `searchEndpoint`     | `{ access }` for `GET /api/geocoding/search` (default: users of the admin user collection), or `false` to not register it.          |
| `enabled`            | Set to `false` to disable the plugin.                                                                                               |

### Google Maps API keys

1. Set up a Google Cloud account and create a project.
2. Enable the **Maps JavaScript API**, the **Places API (New)** and the **Geocoding API**.
3. Create two keys:
   - a **browser key** (`googleMapsApiKey`) restricted by HTTP referrer to your admin domain, since it is sent to the browser
   - a **server key** (`googleServerApiKey`) restricted by IP address or to the Geocoding API. Google refuses referrer-restricted keys for server-side requests, which send no referrer.

The server key is never sent to the browser. There is no fallback from the server key to the browser key, since Google refuses a referrer-restricted key for server-side requests.

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
- `location_address`, a text field hidden in the admin panel: an address written there is geocoded on save and then cleared (see [Usage with AI agents and the API](#usage-with-ai-agents-and-the-api)). It is a regular field, not a virtual one, so content tools and MCP servers that hide virtual fields still offer it. On Postgres and SQLite it adds an always-empty column.

A localized point gets a localized `_meta` and `_address` too.

Inside a Lexical block, give the point no `required`: Payload validates a block's fields before their hooks run, so a required point would be refused before `{name}_address` could fill it. Groups, arrays and blocks fields are not affected.

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

| Situation on save                                              | Result                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| The point is empty and the address is complete                 | The point is geocoded (again on every save until it fills) |
| The caller sets the point                                      | The point is kept; nothing is geocoded                     |
| The address changes and the stored point came from geocoding   | The point is geocoded again                                |
| The address changes and the stored point was entered or picked | The point is kept                                          |
| No match, or a match below `minPrecision`                      | The point is cleared (see below)                           |
| The provider is down, over quota or refuses the key            | A stored point is kept; an empty one is tried next save    |
| An autosave                                                    | Nothing is geocoded                                        |
| A draft save                                                   | Failures do not refuse the save                            |

Pass `country` (ISO 3166-1 alpha-2) whenever it is known, either from `address` or with the field's `country` option (a code or a function of the document): without it, a street name that exists in several countries can resolve to the wrong one. The stored address is in the request locale for a localized point, and in the default locale otherwise. A save across all locales (`locale: 'all'`) does not geocode.

`minPrecision` is the least exact result the field stores: `exact` (building), `interpolated` (between house numbers), `center` (street or area center) or `approximate` (city, postal code; the default). Anything stricter than `approximate` also refuses partial matches.

With `address`, a required point is enforced by the plugin rather than Payload, so the admin panel can submit a document whose point is still to be geocoded. When geocoding yields no usable point and the point is required, publishing fails with the reason as the field's error, e.g. _Could not geocode "Hauptstraße 999, Berlin" exactly enough: the best match "Hauptstraße, 10827 Berlin, Germany" is a partial match, and this field needs interpolated. Add the house number or postal code, or set the coordinates directly._

## Usage with AI agents and the API

The admin autocomplete needs a browser. Agents and API clients have three server-side ways in.

### Send an address with the document

Every `geocodingField` has a `{name}_address` field. An address written there is geocoded on save into the point and meta fields, then cleared:

```bash
POST /api/pages
{ "title": "My Page", "location_address": "Alexanderplatz 1, 10178 Berlin" }
```

Include the city and country in the address, or set the field's `country` option. This is an explicit request, so it replaces the point, and a failed lookup refuses the save, drafts included, whether or not the point is required. Writing it needs the same field access as writing the point. The error names the reason and what to do:

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

No match answers `{ "results": [], "message": "..." }`. Other failures answer an error status with `{ "errors": [{ "message" }], "reason" }`, where `reason` is one of `invalid_request` (400), `not_configured` (501), `denied` (502), `quota` or `unavailable` (503). An anonymous caller gets 401, a user the `access` function refuses gets 403.

A point field stores `[longitude, latitude]`, so write a result as `[location.lng, location.lat]`.

### Geocode in your own code

`geocode()` uses the configured geocoder and never throws, even when a custom geocoder does:

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

Check the provider's terms for how long you may store its results. Google's Maps Platform terms restrict caching of Geocoding API results, so review them before storing geocoded coordinates long term.

## Upgrading from 0.2

`{name}_googlePlacesData` is now `{name}_meta`. On MongoDB, convert stored data in a migration:

```ts
import { migrateGeocodingDataToV03 } from '@jhb.software/payload-geocoding-plugin'

export async function up({ payload }: MigrateUpArgs) {
  await migrateGeocodingDataToV03(payload) // documents, versions and globals, at any depth
}
```

On Postgres or SQLite, write a migration that reads each `*_google_places_data` column, converts it with `upgradeLegacyGeoData`, and writes it to the new `*_meta` column before the old one is dropped.

Add a server key as `googleServerApiKey` to use server-side geocoding.

## About this plugin

This plugin uses the Google Maps Places API (New) `AutocompleteSuggestion` API to provide a search input for finding an address. The selected location's metadata is stored in a JSON field and the coordinates are stored in a Point Field.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

- Extend the field config to accept options like debounce time, API options, etc.
- Bundle geocoders for other providers (Mapbox, HERE, etc.)

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
