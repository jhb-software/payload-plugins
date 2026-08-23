import type { Payload, PayloadRequest } from 'payload'

import { AsyncLocalStorage } from 'node:async_hooks'

import type { Locale } from '../types/Locale.js'
import type { LocaleRouting, PagesPluginConfig } from '../types/PagesPluginConfig.js'

/**
 * Marks the asynchronous scope a `localeRouting` resolver runs in. Everything the resolver awaits
 * inherits the mark, which is what separates a read performed *by* the resolver from a path
 * computation running concurrently *next to* it — the former must not wait for the resolver's
 * result, the latter must.
 */
const resolvingRouting = new AsyncLocalStorage<true>()

/**
 * The evaluation in flight or completed for one request. Keyed by the request object rather than
 * stored on `req.context`, which Payload replaces with a shallow copy on every nested local API
 * call — including the ones a resolver makes, which would fork the cache entry away mid-flight.
 */
const routingByRequest = new WeakMap<PayloadRequest, Promise<LocaleRouting | undefined>>()

/**
 * The locale routing in effect for the given request.
 *
 * A function resolver is evaluated once per request and its (possibly still pending) result is
 * shared, so computing the paths of fifty documents costs one evaluation.
 *
 * A resolver which itself reads a page collection would otherwise wait for its own result: the
 * read's `beforeRead` hook computes paths, which asks for the routing that is still being
 * resolved. Such reads are answered with the default routing (every locale prefixed) instead, so
 * paths seen inside a resolver carry no routing of their own.
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
      'Resolving a page by path requires `req` when the plugin is configured with a `localeRouting` function, so the routing can be evaluated against the request.',
    )
  }

  if (resolvingRouting.getStore()) {
    return undefined
  }

  const cached = routingByRequest.get(req)

  if (cached) {
    return cached
  }

  const pending = resolvingRouting
    .run(true, async () => await option({ req }))
    .then((routing) => (routing ? validateRouting(routing, localization.localeCodes) : undefined))
  routingByRequest.set(req, pending)

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
