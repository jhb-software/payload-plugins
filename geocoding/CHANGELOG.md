# Changelog

## Unreleased

- **BREAKING**: Replaced `react-google-places-autocomplete` with the Google Maps Places API (New) `AutocompleteSuggestion` API. This resolves the deprecation warning for `google.maps.places.AutocompleteService` (deprecated as of March 2025). The `react-google-places-autocomplete` dependency has been removed.
- **BREAKING**: The **Places API (New)** must be enabled in your Google Cloud project. Enable it at: https://console.developers.google.com/apis/api/places.googleapis.com/overview
- **BREAKING**: The `_googlePlacesData` JSON field has been renamed to `_meta` and now stores a flat `{ name, formattedAddress, googlePlaceId, types }` object instead of the previous `react-google-places-autocomplete` format. Existing documents will need to be migrated — see [`migrations/migrate-to-0.3.0.ts`](./migrations/migrate-to-0.3.0.ts).
- **BREAKING**: The `geoDataFieldOverride` config option has been renamed to `locationMetaOverride`.

- fix: accept any React `^19.2.0` as a peer dependency instead of exactly `19.3.0`, which caused install warnings in projects on other 19.x versions
- chore: require Payload `^3.90.1`, which ships critical security fixes

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
