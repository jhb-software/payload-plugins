import type { Field, PayloadRequest, SanitizedConfig } from 'payload'

import ObjectIDModule from 'bson-objectid'
import { tabHasName } from 'payload/shared'

const ObjectID = typeof ObjectIDModule === 'function' ? ObjectIDModule : ObjectIDModule.default

import type { AfterTranslateHook, ValueToTranslate } from './types.js'

import { getFieldTranslatorConfig } from '../types.js'
import { isEmpty } from '../utils/isEmpty.js'
import { traverseRichText } from './traverseRichText.js'

const isUnsafeKey = (key: string): boolean =>
  key === '__proto__' || key === 'constructor' || key === 'prototype'

export const traverseFields = ({
  afterTranslateHooks,
  dataFrom,
  emptyOnly,
  fields,
  localeFrom,
  localeTo,
  localizedParent,
  payloadConfig,
  req,
  siblingDataFrom,
  siblingDataTranslated,
  translatedData,
  valuesToTranslate,
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
  siblingDataFrom = siblingDataFrom ?? dataFrom
  siblingDataTranslated = siblingDataTranslated ?? translatedData

  for (const field of fields) {
    if ('virtual' in field && field.virtual) {
      continue
    }

    if ('name' in field && isUnsafeKey(field.name)) {
      continue
    }

    const translatorConfig = getFieldTranslatorConfig(field)

    // Register the afterTranslate hook (if any) independently of whether the
    // field is translated. It runs once the whole document is translated, so it
    // can post-process this field's own translated value or derive a new value
    // from translated siblings.
    if (
      'name' in field &&
      translatorConfig?.afterTranslate &&
      afterTranslateHooks &&
      (('localized' in field && field.localized) || localizedParent) &&
      !(emptyOnly && !isEmpty(siblingDataTranslated[field.name]))
    ) {
      const targetData = siblingDataTranslated
      const fieldName = field.name
      const sourceValue = siblingDataFrom[field.name]
      const { afterTranslate } = translatorConfig

      afterTranslateHooks.push({
        apply: async ({ data, localeFrom: from, localeTo: to, req: request }) => {
          targetData[fieldName] = await afterTranslate({
            data,
            localeFrom: from,
            localeTo: to,
            req: request,
            siblingData: targetData,
            sourceValue,
            value: targetData[fieldName],
          })
        },
      })

      // A skipped field is never translated, so seed its target value from the
      // source. That gives the hook a meaningful `value` to read or normalize.
      if (translatorConfig.skip) {
        targetData[fieldName] = sourceValue
      }
    }

    // `skip` excludes the field (and anything nested under it) from the
    // resolver. Its final value, if any, comes from afterTranslate above;
    // otherwise the app or a Payload hook owns it.
    if (translatorConfig?.skip) {
      continue
    }

    switch (field.type) {
      case 'array': {
        const arrayDataFrom = siblingDataFrom[field.name] as {
          id: number | string
        }[]

        if (isEmpty(arrayDataFrom)) {
          break
        }

        let arrayDataTranslated =
          (siblingDataTranslated[field.name] as { id: number | string }[] | undefined) ?? []

        if (field.localized || localizedParent) {
          if (arrayDataTranslated.length > 0 && emptyOnly) {
            break
          }

          arrayDataTranslated = arrayDataFrom.map(() => ({
            id: ObjectID().toHexString(),
          }))
        }

        arrayDataTranslated.forEach((item, index) => {
          traverseFields({
            afterTranslateHooks,
            dataFrom,
            emptyOnly,
            fields: field.fields,
            localeFrom,
            localeTo,
            localizedParent: localizedParent ?? field.localized,
            payloadConfig,
            req,
            siblingDataFrom: arrayDataFrom[index],
            siblingDataTranslated: item,
            translatedData,
            valuesToTranslate,
          })
        })

        siblingDataTranslated[field.name] = arrayDataTranslated

        break
      }

      case 'blocks': {
        const blocksDataFrom = siblingDataFrom[field.name] as {
          blockType: string
          id: number | string
        }[]

        if (isEmpty(blocksDataFrom)) {
          break
        }

        let blocksDataTranslated =
          (siblingDataTranslated[field.name] as
            | { blockType: string; id: number | string }[]
            | undefined) ?? []

        if (field.localized || localizedParent) {
          if (blocksDataTranslated.length > 0 && emptyOnly) {
            break
          }

          blocksDataTranslated = blocksDataFrom.map(({ blockType }) => ({
            id: ObjectID().toHexString(),
            blockType,
          }))
        }

        blocksDataTranslated.forEach((item, index) => {
          let blockConfig = undefined
          if (field.blockReferences) {
            blockConfig = payloadConfig.blocks?.find((b) => b.slug === item.blockType)

            if (!blockConfig) {
              console.warn(
                `Block config for block ${item.blockType} not found in payload config.`,
                field,
              )
              return
            }
          } else {
            blockConfig = field.blocks.find((b) => b.slug === item.blockType)

            if (!blockConfig) {
              console.warn(
                `Block config for block ${item.blockType} not found in field config.`,
                field,
              )
              return
            }
          }

          traverseFields({
            afterTranslateHooks,
            dataFrom,
            emptyOnly,
            fields: blockConfig.fields,
            localeFrom,
            localeTo,
            localizedParent: localizedParent ?? field.localized,
            payloadConfig,
            req,
            siblingDataFrom: blocksDataFrom[index],
            siblingDataTranslated: item,
            translatedData,
            valuesToTranslate,
          })
        })

        siblingDataTranslated[field.name] = blocksDataTranslated

        break
      }

      case 'checkbox':
      case 'code':
      case 'date':
      case 'email':
      case 'json':
      case 'number':
      case 'point':
      case 'radio':
      case 'relationship':
      case 'select':
      case 'upload':
        siblingDataTranslated[field.name] = siblingDataFrom[field.name]

        break
      case 'collapsible':
      case 'row':
        traverseFields({
          afterTranslateHooks,
          dataFrom,
          emptyOnly,
          fields: field.fields,
          localeFrom,
          localeTo,
          localizedParent,
          payloadConfig,
          req,
          siblingDataFrom,
          siblingDataTranslated,
          translatedData,
          valuesToTranslate,
        })
        break
      case 'group': {
        if (!('name' in field)) {
          // Unnamed (presentational) groups have no own data key — their fields
          // are stored on the sibling data directly, so traverse them in place
          // like row/collapsible, propagating the parent's localization context.
          traverseFields({
            afterTranslateHooks,
            dataFrom,
            emptyOnly,
            fields: field.fields,
            localeFrom,
            localeTo,
            localizedParent,
            payloadConfig,
            req,
            siblingDataFrom,
            siblingDataTranslated,
            translatedData,
            valuesToTranslate,
          })
          break
        }

        const groupDataFrom = siblingDataFrom[field.name] as Record<string, unknown>

        if (!groupDataFrom) {
          break
        }

        const groupDataTranslated =
          (siblingDataTranslated[field.name] as Record<string, unknown>) ?? {}

        traverseFields({
          afterTranslateHooks,
          dataFrom,
          emptyOnly,
          fields: field.fields,
          localeFrom,
          localeTo,
          localizedParent: field.localized,
          payloadConfig,
          req,
          siblingDataFrom: groupDataFrom,
          siblingDataTranslated: groupDataTranslated,
          translatedData,
          valuesToTranslate,
        })

        siblingDataTranslated[field.name] = groupDataTranslated

        break
      }
      case 'richText': {
        if (!(field.localized || localizedParent) || isEmpty(siblingDataFrom[field.name])) {
          break
        }

        if (emptyOnly && !isEmpty(siblingDataTranslated[field.name])) {
          break
        }

        const richTextDataFrom = siblingDataFrom[field.name] as object

        siblingDataTranslated[field.name] = richTextDataFrom

        if (!richTextDataFrom) {
          break
        }

        const isLexical = 'root' in richTextDataFrom

        if (!isLexical) {
          break
        }

        const root = (siblingDataTranslated[field.name] as Record<string, unknown>)?.root as Record<
          string,
          unknown
        >

        if (root) {
          traverseRichText({
            emptyOnly,
            payloadConfig,
            root,
            translatedData,
            valuesToTranslate,
          })
        }

        break
      }

      case 'tabs':
        for (const tab of field.tabs) {
          const hasName = tabHasName(tab)

          if (hasName && isUnsafeKey(tab.name)) {
            continue
          }

          const tabDataFrom = hasName
            ? (siblingDataFrom[tab.name] as Record<string, unknown>)
            : siblingDataFrom

          if (!tabDataFrom) {
            return
          }

          const tabDataTranslated = hasName
            ? ((siblingDataTranslated[tab.name] as Record<string, unknown>) ?? {})
            : siblingDataTranslated

          traverseFields({
            afterTranslateHooks,
            dataFrom,
            emptyOnly,
            fields: tab.fields,
            localeFrom,
            localeTo,
            localizedParent: tab.localized,
            payloadConfig,
            req,
            siblingDataFrom: tabDataFrom,
            siblingDataTranslated: tabDataTranslated,
            translatedData,
            valuesToTranslate,
          })

          if (hasName) {
            siblingDataTranslated[tab.name] = tabDataTranslated
          }
        }

        break
      case 'text':
      case 'textarea': {
        if (!(field.localized || localizedParent) || isEmpty(siblingDataFrom[field.name])) {
          break
        }
        if (emptyOnly && siblingDataTranslated[field.name]) {
          break
        }

        // do not translate the block ID or admin-facing label
        if (field.name === 'blockName' || field.name === 'id') {
          break
        }

        // `beforeTranslate` lets a field preprocess each source string before it
        // is handed to the resolver (the resolver's output is still written back
        // as usual).
        const preprocess = (raw: unknown): unknown => {
          if (typeof raw !== 'string' || !translatorConfig?.beforeTranslate) {
            return raw
          }

          return translatorConfig.beforeTranslate({
            localeFrom: localeFrom as string,
            localeTo: localeTo as string,
            req: req as PayloadRequest,
            siblingData: siblingDataFrom,
            value: raw,
          })
        }

        const fieldValue = siblingDataFrom[field.name]

        // `hasMany` text fields store an array of strings (e.g. keywords /
        // tags). Translate each element individually - sending the whole
        // array as a single value makes the resolver return a non-string,
        // which then crashes in he.decode(...) ("e.replace is not a
        // function"). Pre-seed the target with the originals and replace
        // each entry in place as its translation resolves, so a skipped or
        // failed element keeps its original text.
        if (Array.isArray(fieldValue)) {
          const translatedArray = [...fieldValue]
          siblingDataTranslated[field.name] = translatedArray

          fieldValue.forEach((item, itemIndex) => {
            if (typeof item !== 'string' || isEmpty(item)) {
              return
            }

            valuesToTranslate.push({
              onTranslate: (translated) => {
                translatedArray[itemIndex] = translated
              },
              value: preprocess(item),
            })
          })

          break
        }

        valuesToTranslate.push({
          onTranslate: (translated) => {
            siblingDataTranslated[field.name] = translated
          },
          value: preprocess(fieldValue),
        })
        break
      }

      default:
        break
    }
  }
}
