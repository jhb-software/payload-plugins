/**
 * Short plugin slug used as the prefix for the plugin's REST endpoints and as the key of the
 * plugin's entry in `config.custom` and `req.context`.
 *
 * Endpoints are served under `<routes.api>/<PLUGIN_SLUG>/...`, e.g. `/api/geocoding/search`.
 */
export const PLUGIN_SLUG = 'geocoding'
