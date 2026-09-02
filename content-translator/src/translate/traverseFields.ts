import type { Field, PayloadRequest, SanitizedConfig } from 'payload'

import ObjectIDModule from 'bson-objectid'
import { tabHasName } from 'payload/shared'

const ObjectID = typeof ObjectIDModule === 'function' ? ObjectIDModule : ObjectIDModule.default

import type { ContentTranslatorFieldConfig } from '../types.js'
import type { AfterTranslateHook, ValueToTranslate } from './types.js'

import { getFieldTranslatorConfig } from '../types.js'
import { isEmpty } from '../utils/isEmpty.js'
import { traverseRichText } from './traverseRichText.js'

/**
 * Everything a field handler needs, with the sibling data already resolved to
 * the level the current field lives on.
 */
type TraverseContext = {
  afterTranslateHooks?: AfterTranslateHook[]
  dataFrom: Record<string, unknown>
  emptyOnly: boolean
  localeFrom?: string
  localeTo?: string
  localizedParent?: boolean
  payloadConfig: SanitizedConfig
  req?: PayloadRequest
  siblingDataFrom: Record<string, unknown>
  siblingDataTranslated: Record<string, unknown>
  translatedData: Record<string, unknown>
  valuesToTranslate: ValueToTranslate[]
}

type FieldOfType<T extends Field['type']> = Extract<Field, { type: T }>

type TranslatorConfig = ContentTranslatorFieldConfig | undefined

type FieldHandler<T extends Field['type']> = (field: FieldOfType<T>, ctx: TraverseContext) => void

const isUnsafeKey = (key: string): boolean =>
  key === '__proto__' || key === 'constructor' || key === 'prototype'

/** Virtual fields hold no stored data, and unsafe keys must never be written. */
const isTraversable = (field: Field): boolean =>
  !('virtual' in field && field.virtual) && !('name' in field && isUnsafeKey(field.name))

const isLocalized = (field: Field, localizedParent?: boolean): boolean =>
  ('localized' in field && Boolean(field.localized)) || Boolean(localizedParent)

/**
 * Register the field's afterTranslate hook (if any) independently of whether
 * the field is translated. It runs once the whole document is translated, so it
 * can post-process this field's own translated value or derive a new value from
 * translated siblings. For a skipped field this also seeds the target value from
 * the source, so the hook has a meaningful `value` to read.
 */
const registerAfterTranslateHook = (
  field: Field,
  ctx: TraverseContext,
  translatorConfig: TranslatorConfig,
): void => {
  const {
    afterTranslateHooks,
    emptyOnly,
    localizedParent,
    siblingDataFrom,
    siblingDataTranslated,
  } = ctx
  const afterTranslate = translatorConfig?.afterTranslate

  if (!('name' in field) || !afterTranslate || !afterTranslateHooks) {
    return
  }

  if (!isLocalized(field, localizedParent)) {
    return
  }

  if (emptyOnly && !isEmpty(siblingDataTranslated[field.name])) {
    return
  }

  const fieldName = field.name
  const sourceValue = siblingDataFrom[fieldName]

  afterTranslateHooks.push({
    apply: async ({ data, localeFrom: from, localeTo: to, req: request }) => {
      siblingDataTranslated[fieldName] = await afterTranslate({
        data,
        localeFrom: from,
        localeTo: to,
        req: request,
        siblingData: siblingDataTranslated,
        sourceValue,
        value: siblingDataTranslated[fieldName],
      })
    },
  })

  // A skipped field is never translated, so seed its target value from the
  // source. That gives the hook a meaningful `value` to read or normalize.
  if (translatorConfig?.skip) {
    siblingDataTranslated[fieldName] = sourceValue
  }
}

/** Field types whose value is carried over untranslated. */
const copyValue = (field: { name: string }, ctx: TraverseContext): void => {
  ctx.siblingDataTranslated[field.name] = ctx.siblingDataFrom[field.name]
}

/**
 * Presentational wrappers (rows, collapsibles, unnamed groups and tabs) hold no
 * data key of their own — their fields live on the sibling data directly.
 */
const traverseInPlace = (fields: Field[], ctx: TraverseContext): void => {
  traverseFields({ ...ctx, fields })
}

const traverseArrayField: FieldHandler<'array'> = (field, ctx) => {
  const { emptyOnly, localizedParent, siblingDataFrom, siblingDataTranslated } = ctx

  const arrayDataFrom = siblingDataFrom[field.name] as {
    id: number | string
  }[]

  if (isEmpty(arrayDataFrom)) {
    return
  }

  let arrayDataTranslated =
    (siblingDataTranslated[field.name] as { id: number | string }[] | undefined) ?? []

  if (isLocalized(field, localizedParent)) {
    if (arrayDataTranslated.length > 0 && emptyOnly) {
      return
    }

    arrayDataTranslated = arrayDataFrom.map(() => ({
      id: ObjectID().toHexString(),
    }))
  }

  arrayDataTranslated.forEach((item, index) => {
    traverseFields({
      ...ctx,
      fields: field.fields,
      localizedParent: localizedParent ?? field.localized,
      siblingDataFrom: arrayDataFrom[index],
      siblingDataTranslated: item,
    })
  })

  siblingDataTranslated[field.name] = arrayDataTranslated
}

/** Resolve a block's field config from the payload config or the field itself. */
const findBlockConfig = (
  field: FieldOfType<'blocks'>,
  blockType: string,
  payloadConfig: SanitizedConfig,
  req?: PayloadRequest,
): { fields: Field[] } | undefined => {
  if (field.blockReferences) {
    const blockConfig = payloadConfig.blocks?.find((b) => b.slug === blockType)

    if (!blockConfig) {
      req?.payload.logger.warn(
        { field },
        `Block config for block ${blockType} not found in payload config.`,
      )
    }

    return blockConfig
  }

  const blockConfig = field.blocks.find((b) => b.slug === blockType)

  if (!blockConfig) {
    req?.payload.logger.warn(
      { field },
      `Block config for block ${blockType} not found in field config.`,
    )
  }

  return blockConfig
}

const traverseBlocksField: FieldHandler<'blocks'> = (field, ctx) => {
  const { emptyOnly, localizedParent, payloadConfig, siblingDataFrom, siblingDataTranslated } = ctx

  const blocksDataFrom = siblingDataFrom[field.name] as {
    blockType: string
    id: number | string
  }[]

  if (isEmpty(blocksDataFrom)) {
    return
  }

  let blocksDataTranslated =
    (siblingDataTranslated[field.name] as
      { blockType: string; id: number | string }[] | undefined) ?? []

  if (isLocalized(field, localizedParent)) {
    if (blocksDataTranslated.length > 0 && emptyOnly) {
      return
    }

    blocksDataTranslated = blocksDataFrom.map(({ blockType }) => ({
      id: ObjectID().toHexString(),
      blockType,
    }))
  }

  blocksDataTranslated.forEach((item, index) => {
    const blockConfig = findBlockConfig(field, item.blockType, payloadConfig, ctx.req)

    if (!blockConfig) {
      return
    }

    traverseFields({
      ...ctx,
      fields: blockConfig.fields,
      localizedParent: localizedParent ?? field.localized,
      siblingDataFrom: blocksDataFrom[index],
      siblingDataTranslated: item,
    })
  })

  siblingDataTranslated[field.name] = blocksDataTranslated
}

const traverseGroupField: FieldHandler<'group'> = (field, ctx) => {
  if (!('name' in field)) {
    // Unnamed (presentational) groups have no own data key — their fields are
    // stored on the sibling data directly, so traverse them in place like
    // row/collapsible, propagating the parent's localization context.
    traverseInPlace(field.fields, ctx)

    return
  }

  const groupDataFrom = ctx.siblingDataFrom[field.name] as Record<string, unknown>

  if (!groupDataFrom) {
    return
  }

  const groupDataTranslated =
    (ctx.siblingDataTranslated[field.name] as Record<string, unknown>) ?? {}

  traverseFields({
    ...ctx,
    fields: field.fields,
    localizedParent: field.localized,
    siblingDataFrom: groupDataFrom,
    siblingDataTranslated: groupDataTranslated,
  })

  ctx.siblingDataTranslated[field.name] = groupDataTranslated
}

const traverseRichTextField: FieldHandler<'richText'> = (field, ctx) => {
  const { emptyOnly, localizedParent, payloadConfig, siblingDataFrom, siblingDataTranslated } = ctx

  if (!isLocalized(field, localizedParent) || isEmpty(siblingDataFrom[field.name])) {
    return
  }

  if (emptyOnly && !isEmpty(siblingDataTranslated[field.name])) {
    return
  }

  const richTextDataFrom = siblingDataFrom[field.name] as object

  siblingDataTranslated[field.name] = richTextDataFrom

  if (!richTextDataFrom) {
    return
  }

  const isLexical = 'root' in richTextDataFrom

  if (!isLexical) {
    return
  }

  const root = (siblingDataTranslated[field.name] as Record<string, unknown>)?.root as Record<
    string,
    unknown
  >

  if (root) {
    traverseRichText({
      emptyOnly,
      payloadConfig,
      req: ctx.req,
      root,
      translatedData: ctx.translatedData,
      valuesToTranslate: ctx.valuesToTranslate,
    })
  }
}

const traverseTabsField: FieldHandler<'tabs'> = (field, ctx) => {
  const { siblingDataFrom, siblingDataTranslated } = ctx

  for (const tab of field.tabs) {
    const hasName = tabHasName(tab)

    if (hasName && isUnsafeKey(tab.name)) {
      continue
    }

    const tabDataFrom = hasName
      ? (siblingDataFrom[tab.name] as Record<string, unknown>)
      : siblingDataFrom

    // Nothing to read from for this tab — skip it and carry on with the rest,
    // the same way a group without source data is skipped.
    if (!tabDataFrom) {
      continue
    }

    const tabDataTranslated = hasName
      ? ((siblingDataTranslated[tab.name] as Record<string, unknown>) ?? {})
      : siblingDataTranslated

    traverseFields({
      ...ctx,
      fields: tab.fields,
      localizedParent: tab.localized,
      siblingDataFrom: tabDataFrom,
      siblingDataTranslated: tabDataTranslated,
    })

    if (hasName) {
      siblingDataTranslated[tab.name] = tabDataTranslated
    }
  }
}

/**
 * `beforeTranslate` lets a field preprocess each source string before it is
 * handed to the resolver (the resolver's output is still written back as usual).
 */
const preprocessValue = (
  raw: unknown,
  ctx: TraverseContext,
  translatorConfig: TranslatorConfig,
): unknown => {
  if (typeof raw !== 'string' || !translatorConfig?.beforeTranslate) {
    return raw
  }

  return translatorConfig.beforeTranslate({
    localeFrom: ctx.localeFrom as string,
    localeTo: ctx.localeTo as string,
    req: ctx.req as PayloadRequest,
    siblingData: ctx.siblingDataFrom,
    value: raw,
  })
}

/**
 * `hasMany` text fields store an array of strings (e.g. keywords / tags).
 * Translate each element individually - sending the whole array as a single
 * value makes the resolver return a non-string, which then crashes in
 * he.decode(...) ("e.replace is not a function"). Pre-seed the target with the
 * originals and replace each entry in place as its translation resolves, so a
 * skipped or failed element keeps its original text.
 */
const collectHasManyTextValues = (
  fieldName: string,
  fieldValue: unknown[],
  ctx: TraverseContext,
  translatorConfig: TranslatorConfig,
): void => {
  const translatedArray = [...fieldValue]
  ctx.siblingDataTranslated[fieldName] = translatedArray

  fieldValue.forEach((item, itemIndex) => {
    if (typeof item !== 'string' || isEmpty(item)) {
      return
    }

    ctx.valuesToTranslate.push({
      onTranslate: (translated) => {
        translatedArray[itemIndex] = translated
      },
      value: preprocessValue(item, ctx, translatorConfig),
    })
  })
}

const traverseTextField = (field: FieldOfType<'text' | 'textarea'>, ctx: TraverseContext): void => {
  const { emptyOnly, localizedParent, siblingDataFrom, siblingDataTranslated } = ctx
  const translatorConfig = getFieldTranslatorConfig(field)

  if (!isLocalized(field, localizedParent) || isEmpty(siblingDataFrom[field.name])) {
    return
  }

  if (emptyOnly && siblingDataTranslated[field.name]) {
    return
  }

  // do not translate the block ID or admin-facing label
  if (field.name === 'blockName' || field.name === 'id') {
    return
  }

  const fieldValue = siblingDataFrom[field.name]

  if (Array.isArray(fieldValue)) {
    collectHasManyTextValues(field.name, fieldValue, ctx, translatorConfig)

    return
  }

  ctx.valuesToTranslate.push({
    onTranslate: (translated) => {
      siblingDataTranslated[field.name] = translated
    },
    value: preprocessValue(fieldValue, ctx, translatorConfig),
  })
}

const fieldHandlers: {
  [T in Field['type']]?: FieldHandler<T>
} = {
  array: traverseArrayField,
  blocks: traverseBlocksField,
  checkbox: copyValue,
  code: copyValue,
  collapsible: (field, ctx) => traverseInPlace(field.fields, ctx),
  date: copyValue,
  email: copyValue,
  group: traverseGroupField,
  json: copyValue,
  number: copyValue,
  point: copyValue,
  radio: copyValue,
  relationship: copyValue,
  richText: traverseRichTextField,
  row: (field, ctx) => traverseInPlace(field.fields, ctx),
  select: copyValue,
  tabs: traverseTabsField,
  text: traverseTextField,
  textarea: traverseTextField,
  upload: copyValue,
}

export const traverseFields = ({
  fields,
  siblingDataFrom,
  siblingDataTranslated,
  ...rest
}: {
  afterTranslateHooks?: AfterTranslateHook[]
  dataFrom: Record<string, unknown>
  emptyOnly: boolean
  fields: Field[]
  localeFrom?: string
  localeTo?: string
  localizedParent?: boolean
  payloadConfig: SanitizedConfig
  req?: PayloadRequest
  siblingDataFrom?: Record<string, unknown>
  siblingDataTranslated?: Record<string, unknown>
  translatedData: Record<string, unknown>
  valuesToTranslate: ValueToTranslate[]
}) => {
  const ctx: TraverseContext = {
    ...rest,
    siblingDataFrom: siblingDataFrom ?? rest.dataFrom,
    siblingDataTranslated: siblingDataTranslated ?? rest.translatedData,
  }

  for (const field of fields) {
    if (!isTraversable(field)) {
      continue
    }

    const translatorConfig = getFieldTranslatorConfig(field)

    registerAfterTranslateHook(field, ctx, translatorConfig)

    // `skip` excludes the field (and anything nested under it) from the
    // resolver. Its final value, if any, comes from afterTranslate above;
    // otherwise the app or a Payload hook owns it.
    if (translatorConfig?.skip) {
      continue
    }

    // The map guarantees each handler matches its field type, but indexing it
    // with the union loses that link, so the call needs a widening cast.
    const handler = fieldHandlers[field.type] as FieldHandler<Field['type']> | undefined

    handler?.(field, ctx)
  }
}
