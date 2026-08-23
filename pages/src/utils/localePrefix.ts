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
  return Object.fromEntries(locales.map((locale) => [locale, localePathPrefix(locale, routing)]))
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

/**
 * Splits a requested path into the locale it addresses and the slug segments below the locale
 * prefix.
 *
 * A leading segment is only read as a locale prefix when that locale is actually served
 * prefixed — on a site serving `de` unprefixed, `/de/...` is a path whose first slug happens to
 * read `de` (which slug validation rejects, so it resolves to nothing). Without a prefix the
 * locale falls back to the primary locale, or to Payload's default locale when no routing is
 * configured. An explicit locale argument always wins.
 */
export function parseLocalizedPath({
  defaultLocale,
  explicitLocale,
  localeCodes,
  routing,
  segments,
}: {
  defaultLocale: Locale
  explicitLocale: Locale | undefined
  localeCodes: Locale[]
  routing: LocaleRouting | undefined
  segments: string[]
}): { locale: Locale; slugSegments: string[] } {
  const prefix = segments[0]
  const prefixed =
    Boolean(prefix) && localeCodes.includes(prefix) && isPrefixedLocale(prefix, routing)

  return {
    locale: explicitLocale ?? (prefixed ? prefix : (routing?.primaryLocale ?? defaultLocale)),
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
