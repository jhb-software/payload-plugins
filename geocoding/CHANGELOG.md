# Changelog

## 0.3.0

- **BREAKING**: Replaced `react-google-places-autocomplete` with Google's native `PlaceAutocompleteElement` web component. This resolves the deprecation warning for `google.maps.places.AutocompleteService` (deprecated as of March 2025). The `react-google-places-autocomplete` dependency has been removed; the plugin now loads the Google Maps JS API directly and uses the recommended `PlaceAutocompleteElement` and `fetchFields` API.

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
