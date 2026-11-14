import type { CollectionSlug, GlobalSlug, PayloadHandler } from 'payload'

import { APIError } from 'payload'

import type { TranslateAccess, TranslateEndpointArgs } from './types.js'

import { translateOperation } from './operation.js'

/** Slugs the plugin was configured to translate. */
type EnabledEntities = {
  collections: CollectionSlug[]
  globals: GlobalSlug[]
}

export const translateEndpoint =
  (access: TranslateAccess, enabledEntities: EnabledEntities): PayloadHandler =>
  async (req) => {
    if (!req.json) {
      throw new APIError('Request body must be valid JSON', 400)
    }

    let body: TranslateEndpointArgs
    try {
      body = (await req.json()) as TranslateEndpointArgs
    } catch {
      throw new APIError('Request body must be valid JSON', 400)
    }

    // Build a sanitized allow-list from the untrusted body. Only these fields
    // are ever forwarded. `overrideAccess` is intentionally NOT picked here, so
    // a caller cannot inject `overrideAccess: true` to bypass access control.
    const args = {
      id: body.id,
      collectionSlug: body.collectionSlug,
      data: body.data,
      draft: body.draft ?? false,
      emptyOnly: body.emptyOnly,
      globalSlug: body.globalSlug,
      locale: body.locale,
      localeFrom: body.localeFrom,
      update: body.update ?? false,
    }

    // Only entities the plugin was explicitly configured to translate may be
    // targeted. Without this, any collection/global the requesting user can
    // access would be translatable through this endpoint (and its content sent
    // to the external resolver), not just the opt-in set. Checked against the
    // plugin config — never against `req.payload.config.collections`, which
    // lists every entity. `globalSlug` takes precedence, matching the
    // operation's `isGlobal = !!globalSlug`. Fails closed.
    if (args.globalSlug) {
      if (!enabledEntities.globals.includes(args.globalSlug)) {
        throw new APIError('Translation is not enabled for this global', 400)
      }
    } else if (args.collectionSlug) {
      if (!enabledEntities.collections.includes(args.collectionSlug)) {
        throw new APIError('Translation is not enabled for this collection', 400)
      }
    }

    // The access function receives the parsed request args (e.g. `update`,
    // `collectionSlug`) so it can authorize per request — but the args are
    // attacker-controlled: grant on `req.user`, only ever restrict on the args.
    // Throwing/rejecting here fails closed (the request is denied).
    if (!(await access({ req, ...args }))) {
      throw new APIError('You are not allowed to translate this content', 401)
    }

    // `overrideAccess: false` is hardcoded (last) so the requesting user's own
    // collection/global access still gates every read and write, regardless of
    // what the body contained. Never replace this with a spread of the body.
    const result = await translateOperation({
      ...args,
      overrideAccess: false,
      req,
    })

    return Response.json(result)
  }
