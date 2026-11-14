# Changelog

## Unreleased

- **BREAKING**: Replaced `react-google-places-autocomplete` with the Google Maps Places API (New) `AutocompleteSuggestion` API. This resolves the deprecation warning for `google.maps.places.AutocompleteService` (deprecated as of March 2025). The `react-google-places-autocomplete` dependency has been removed.
- **BREAKING**: The **Places API (New)** must be enabled in your Google Cloud project. Enable it at: https://console.developers.google.com/apis/api/places.googleapis.com/overview
- **BREAKING**: The `_googlePlacesData` JSON field has been renamed to `_meta` and now stores a flat `{ name, formattedAddress, googlePlaceId, types }` object. On MongoDB, run the exported `migrateGeocodingDataToV03(payload)` in a migration to convert stored documents, versions and globals; on Postgres or SQLite, convert the column with `upgradeLegacyGeoData` in a Payload migration before the old column is dropped.
- **BREAKING**: The `geoDataFieldOverride` config option has been renamed to `locationMetaOverride`.
- feat: geocode server-side for agents and API clients: an address written to the hidden `{name}_address` field (REST, Local API, GraphQL or an MCP tool) is geocoded on save and never stored; a failed lookup refuses the save with the reason and what to do, drafts included
- feat: add the `address` option to `geocodingField`, which fills the point from address fields the document already has, never overwrites a point someone entered or picked, and re-geocodes a geocoded point when the address or country changes; `minPrecision` refuses imprecise or partial matches, and the `country` option restricts results to a country
- feat: add `GET /api/geocoding/search?q=&country=&language=` for users of the admin user collection, configurable or disabled with the `searchEndpoint` option
- feat: export `geocode()` for custom hooks and endpoints, and accept a `geocoder` option to use a provider other than Google
- feat: add the `googleServerApiKey` option, required for server-side geocoding since Google refuses the referrer-restricted browser key there; without `googleMapsApiKey` the field shows the stored place read-only instead of the address search
- **BREAKING**: `_meta` (and `_address`) are localized when the point field is localized, so a localized point's place is stored per locale; on such fields the stored meta reads as empty until each locale is saved again
- fix: accept any React `^19.2.0` as a peer dependency instead of exactly `19.3.0`, which caused install warnings in projects on other 19.x versions
- **BREAKING**: require Payload `^3.93.0`

## 0.2.2

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16

## 0.2.0

- **BREAKING**: The Google Maps API key is now a required plugin configuration option:

```ts
// Before (<0.2.0):
plugins: [payloadGeocodingPlugin({})]

// After (>=0.2.0):
plugins: [
  payloadGeocodingPlugin({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  }),
]
```

## 0.1.6

- fix: display asterisk for required geodata fields in UI ([87413ba](https://github.com/jhb-software/payload-plugins/commit/87413bac8c3f03ec257ac47de979413930816ee8))

## 0.1.0

- Initial release
