import type { PayloadHandler, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import type { TranslateEndpointArgs } from './types.js'

import { translateOperation } from './operation.js'

type Access = (args: { req: PayloadRequest }) => boolean | Promise<boolean>

export const translateEndpoint =
  (access: Access): PayloadHandler =>
  async (req) => {
    if (!(await access({ req }))) {
      throw new APIError('You must be logged in to translate content', 401)
    }

    if (!req.json) {
      throw new APIError('Content-Type should be json')
    }

    const args: TranslateEndpointArgs = await req.json()

    const { id, collectionSlug, data, emptyOnly, globalSlug, locale, localeFrom } = args

    const result = await translateOperation({
      id,
      collectionSlug,
      data,
      emptyOnly,
      globalSlug,
      locale,
      localeFrom,
      overrideAccess: false,
      req,
      update: false,
    })

    return Response.json(result)
  }
