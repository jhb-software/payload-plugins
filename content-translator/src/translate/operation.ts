import he from 'he'
import { APIError, type Payload, type PayloadRequest } from 'payload'

import type { TranslatorCustomConfig } from '../types.js'
import type { TranslateArgs, TranslateResult, ValueToTranslate } from './types.js'

import { findEntityWithConfig } from './findEntityWithConfig.js'
import { traverseFields } from './traverseFields.js'
import { updateEntity } from './updateEntity.js'

export type TranslateOperationArgs = (
  | {
      payload: Payload
    }
  | {
      req: PayloadRequest
    }
) &
  TranslateArgs

export const translateOperation = async (args: TranslateOperationArgs) => {
  const req: PayloadRequest =
    'req' in args
      ? args.req
      : ({
          payload: args.payload,
        } as PayloadRequest)

  const { id, collectionSlug, globalSlug, locale, localeFrom, overrideAccess } = args

  const { config, doc: dataFrom } = await findEntityWithConfig({
    id,
    collectionSlug,
    globalSlug,
    locale: localeFrom,
    overrideAccess,
    req,
  })

  const resolver = (req.payload.config.custom as TranslatorCustomConfig | undefined)?.translator
    ?.resolver

  if (!resolver) {
    throw new APIError('No translation resolver configured')
  }

  const valuesToTranslate: ValueToTranslate[] = []

  let translatedData = args.data

  if (!translatedData) {
    const { doc } = await findEntityWithConfig({
      id,
      collectionSlug,
      globalSlug,
      locale,
      overrideAccess,
      req,
    })

    translatedData = doc
  }

  traverseFields({
    dataFrom,
    emptyOnly: args.emptyOnly ?? false,
    fields: config.fields,
    payloadConfig: req.payload.config,
    translatedData,
    valuesToTranslate,
  })

  const resolveResult = await resolver.resolve({
    localeFrom: args.localeFrom,
    localeTo: args.locale,
    req,
    texts: valuesToTranslate.map((each) => each.value),
  })

  let result: TranslateResult

  if (!resolveResult.success) {
    result = {
      success: false,
    }
  } else if (resolveResult.translatedTexts.length !== valuesToTranslate.length) {
    // Defense in depth: the resolver must return exactly one translation per
    // input value, in order. A count mismatch means index-based write-back
    // would shift translations into the wrong fields, so fail instead.
    req.payload.logger.error({
      inputCount: valuesToTranslate.length,
      message: 'Translation aborted: resolver returned a different number of texts than were sent',
      outputCount: resolveResult.translatedTexts.length,
    })

    result = {
      success: false,
    }
  } else {
    resolveResult.translatedTexts.forEach((translated, index) => {
      // he.decode() calls String.prototype.replace internally, so a
      // non-string value (e.g. an array slipping through from a hasMany
      // field) would throw "e.replace is not a function". Guard against it
      // and pass non-strings through untouched.
      const formattedValue = typeof translated === 'string' ? he.decode(translated) : translated

      valuesToTranslate[index].onTranslate(formattedValue)
    })

    if (args.update) {
      await updateEntity({
        id,
        collectionSlug,
        data: translatedData,
        depth: 0,
        draft: args.draft,
        globalSlug,
        locale,
        overrideAccess,
        req,
      })
    }

    result = {
      success: true,
      translatedData,
    }
  }

  return result
}
