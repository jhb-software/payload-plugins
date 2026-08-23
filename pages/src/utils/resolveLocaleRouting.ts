import type { Payload, PayloadRequest } from 'payload'

import { AsyncLocalStorage } from 'node:async_hooks'

import type { Locale } from '../types/Locale.js'
import type { LocaleRouting, PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { localeCodesOf } from './localeFromRequest.js'
import { localePrefixMap } from './localePrefix.js'
import { pagesPluginConfigOf } from './pageCollectionConfigHelpers.js'

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

/**
 * The locale prefixes in effect for the given collection and request, as plain data a field's
 * server component can hand to its client component — which has no `req` and therefore cannot
 * resolve a per-request routing itself.
 */
export async function resolveLocalePrefixes({
  collectionSlug,
  payload,
  req,
}: {
  collectionSlug: string | undefined
  payload: Payload
  req: PayloadRequest | undefined
}): Promise<Record<Locale, string> | undefined> {
  const collection = payload.config.collections.find(
    (candidate) => candidate.slug === collectionSlug,
  )
  const routing = await resolveLocaleRouting({
    payload,
    pluginConfig: pagesPluginConfigOf(collection),
    req,
  })

  return localePrefixMap(localeCodesOf(payload), routing)
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
