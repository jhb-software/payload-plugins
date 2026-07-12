import type { PayloadHandler } from 'payload'

import { APIError } from 'payload'

import type { TranslateAccess, TranslateEndpointArgs } from './types.js'

import { translateOperation } from './operation.js'

export const translateEndpoint =
  (access: TranslateAccess): PayloadHandler =>
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
