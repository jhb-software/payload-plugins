/**
 * Pure locale-prefix helpers, shared by the server hooks and by the admin client components. The
 * client bundle cannot resolve node built-ins, so this module must stay free of them — the routing
 * resolver, which needs `node:async_hooks`, lives in `resolveLocaleRouting.ts` instead.
 */

import type { Locale } from '../types/Locale.js'
import type { LocaleRouting } from '../types/PagesPluginConfig.js'

/** Whether the locale's paths carry a `/<locale>` prefix under the given routing. */
export function isPrefixedLocale(
  locale: Locale | undefined,
  routing: LocaleRouting | undefined,
): boolean {
  if (!locale) {
    return false
  }
  return !(routing?.prefixPrimaryLocale === false && routing.primaryLocale === locale)
}

/** The path prefix of the given locale: `/<locale>`, or the empty string when it carries none. */
export function localePathPrefix(
  locale: Locale | undefined,
  routing: LocaleRouting | undefined,
): string {
  return isPrefixedLocale(locale, routing) ? `/${locale}` : ''
}

/** The path a root page resolves at: the locale prefix, or `/` when the locale carries none. */
export function rootPathForLocale(
  locale: Locale | undefined,
  routing: LocaleRouting | undefined,
): string {
  return localePathPrefix(locale, routing) || '/'
}

/**
 * Memoized {@link localePrefixMap} results, keyed by the routing object and then by the locale
 * list. A `beforeRead` hook builds the map once per document, so a list read of fifty documents
 * would otherwise rebuild the same map fifty times. Both keys are stable within a request: a
 * static routing is the same object every time, and a resolved one is shared per request.
 *
 * The maps are frozen because they are handed out by reference and outlive the request.
 */
const prefixMapCache = new WeakMap<object, Map<string, Record<Locale, string>>>()

/** Stands in for `routing: undefined`, which cannot key a WeakMap. */
const NO_ROUTING = {}

/**
 * The prefix of every configured locale, as plain data the admin client can be handed instead of
 * the routing itself.
 */
export function localePrefixMap(
  locales: Locale[] | undefined,
  routing: LocaleRouting | undefined,
): Record<Locale, string> | undefined {
  if (!locales) {
    return undefined
  }

  const byLocales = prefixMapCache.get(routing ?? NO_ROUTING) ?? new Map()
  prefixMapCache.set(routing ?? NO_ROUTING, byLocales)

  const key = locales.join(',')
  const cached = byLocales.get(key)
  if (cached) {
    return cached
  }

  const map = Object.freeze(
    Object.fromEntries(locales.map((locale) => [locale, localePathPrefix(locale, routing)])),
  ) as Record<Locale, string>
  byLocales.set(key, map)

  return map
}

/**
 * The prefix of one locale, read from a {@link localePrefixMap}. An unmapped locale falls back to
 * `/<locale>`, the shape every locale has without routing.
 */
export function prefixForLocale(
  localePrefixes: Record<Locale, string> | undefined,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined,
): string {
  if (!locale || locale === 'all') {
    return ''
  }
  return localePrefixes?.[locale] ?? `/${locale}`
}

/** {@link rootPathForLocale}, for a caller holding a {@link localePrefixMap} instead of the routing. */
export function rootPathFromPrefixes(
  localePrefixes: Record<Locale, string> | undefined,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined,
): string {
  return prefixForLocale(localePrefixes, locale) || '/'
}

/**
 * Splits a requested path into the locale it addresses and the slug segments below the locale
 * prefix.
 *
 * A leading segment is only read as a locale prefix when that locale is actually served
 * prefixed — on a site serving `de` unprefixed, `/de/...` is a path whose first slug happens to
 * read `de` (which slug validation rejects, so it resolves to nothing). Without a prefix the
 * locale falls back to the primary locale, or to Payload's default locale when no routing is
 * configured. An explicit locale argument always wins.
 *
 * On an unlocalized install there is no prefix to strip and no locale to infer.
 */
export function parseLocalizedPath({
  explicitLocale,
  localization,
  routing,
  segments,
}: {
  explicitLocale: Locale | undefined
  localization: { defaultLocale: Locale; localeCodes: Locale[] } | false
  routing: LocaleRouting | undefined
  segments: string[]
}): { locale: Locale | undefined; slugSegments: string[] } {
  if (!localization) {
    return { locale: explicitLocale, slugSegments: segments }
  }

  const prefix = segments[0]
  const prefixed =
    Boolean(prefix) &&
    localization.localeCodes.includes(prefix) &&
    isPrefixedLocale(prefix, routing)

  return {
    locale:
      explicitLocale ??
      (prefixed ? prefix : (routing?.primaryLocale ?? localization.defaultLocale)),
    slugSegments: prefixed ? segments.slice(1) : segments,
  }
}

/**
 * The routing's contribution to the path cache key. Routing changes which document a path
 * resolves to, so two routings must never share a cache slot.
 */
export function localeRoutingCacheToken(routing: LocaleRouting | undefined): string {
  if (!routing) {
    return '-'
  }
  return `${routing.primaryLocale}${routing.prefixPrimaryLocale === false ? '!' : ''}`
}
