import type { Payload, PayloadRequest } from 'payload'

import type { Locale } from '../types/Locale.js'
import type { LocaleRouting, PagesPluginConfig } from '../types/PagesPluginConfig.js'

/**
 * Request context key under which the resolved routing is cached, so a function resolver runs
 * once per request no matter how many documents' paths are computed on it.
 */
export const LOCALE_ROUTING_CONTEXT_KEY = 'pagesPluginLocaleRouting'

/**
 * The locale routing in effect for the given request.
 *
 * A function resolver is evaluated once and its (possibly still pending) result is stashed on
 * `req.context`, so concurrent path computations share a single evaluation.
 */
export async function resolveLocaleRouting({
  payload,
  pluginConfig,
  req,
}: {
  payload: Payload
  pluginConfig: PagesPluginConfig | undefined
  req: PayloadRequest | undefined
}): Promise<LocaleRouting | undefined> {
  const option = pluginConfig?.localeRouting
  const localization = payload.config.localization

  if (!option || !localization) {
    return undefined
  }

  if (typeof option !== 'function') {
    return validateRouting(option, localization.localeCodes)
  }

  if (!req) {
    throw new Error(
      '[Pages Plugin] A function `localeRouting` can only be resolved with a `req`, as it is evaluated against the request.',
    )
  }

  const context = req.context as Record<string, unknown>
  const cached = context[LOCALE_ROUTING_CONTEXT_KEY] as
    Promise<LocaleRouting | undefined> | undefined

  if (cached) {
    return cached
  }

  // Deferring the call by a microtask lets the cache entry land first, so a resolver which
  // itself reads a page collection cannot re-enter this function and loop.
  const pending = Promise.resolve()
    .then(() => option({ req }))
    .then((routing) => (routing ? validateRouting(routing, localization.localeCodes) : undefined))
  context[LOCALE_ROUTING_CONTEXT_KEY] = pending

  return pending
}

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

/** A typo in `primaryLocale` would silently rewrite every path, so it is rejected loudly. */
function validateRouting(routing: LocaleRouting, localeCodes: Locale[]): LocaleRouting {
  if (!localeCodes.includes(routing.primaryLocale)) {
    throw new Error(
      `[Pages Plugin] \`localeRouting.primaryLocale\` is "${routing.primaryLocale}", which is not one of the configured locales (${localeCodes.join(', ')}).`,
    )
  }
  return routing
}
