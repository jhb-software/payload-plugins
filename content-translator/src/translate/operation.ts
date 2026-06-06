import he from 'he'
import { APIError, type Payload, type PayloadRequest } from 'payload'

import type { TranslatorCustomConfig } from '../types.js'
import type {
  IncrementalAccumulator,
  TranslateArgs,
  TranslateResult,
  ValueToTranslate,
} from './types.js'

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
    req,
  })

  const resolver = (req.payload.config.custom as TranslatorCustomConfig | undefined)?.translator
    ?.resolver

  if (!resolver) {
    throw new APIError('No translation resolver configured')
  }

  const valuesToTranslate: ValueToTranslate[] = []
  const incremental: IncrementalAccumulator = { conflictCount: 0, stamps: [] }

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
    fields: config.fields,
    incremental,
    localeFrom: args.localeFrom,
    mode: args.mode ?? 'all',
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
  } else {
    resolveResult.translatedTexts.forEach((translated, index) => {
      const formattedValue = he.decode(translated)

      valuesToTranslate[index].onTranslate(formattedValue)
    })

    // Stamp content-addressed hashes now that the translated text is in place.
    for (const stamp of incremental.stamps) {
      stamp()
    }

    if (args.update) {
      await updateEntity({
        id,
        collectionSlug,
        data: translatedData,
        depth: 0,
        globalSlug,
        locale,
        overrideAccess,
        req,
      })
    }

    result = {
      reviewCount: incremental.conflictCount,
      success: true,
      translatedData,
    }
  }

  return result
}
