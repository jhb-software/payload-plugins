import type { Locale } from '../types/Locale.js'
import type { LocaleRouting } from '../types/PagesPluginConfig.js'
import type { SeoMetadata } from '../types/SeoMetadata.js'

/**
 * The `alternatePaths` entries for a document's per-locale paths.
 *
 * With routing configured, the primary locale's path is repeated as `x-default` — the entry
 * search engines read as "use this when no language matches". Without routing there is no
 * primary locale and therefore no `x-default`.
 */
export function alternatePathsFor(
  paths: Record<Locale, string>,
  routing: LocaleRouting | undefined,
): SeoMetadata['alternatePaths'] {
  const entries: SeoMetadata['alternatePaths'] = Object.entries(paths).map(([locale, path]) => ({
    hreflang: locale,
    path,
  }))

  const primaryPath = routing ? paths[routing.primaryLocale] : undefined
  if (primaryPath) {
    entries.push({ hreflang: 'x-default', path: primaryPath })
  }

  return entries
}
