import type { Field, SanitizedConfig } from 'payload'

import ObjectIDModule from 'bson-objectid'
import { tabHasName } from 'payload/shared'

const ObjectID = typeof ObjectIDModule === 'function' ? ObjectIDModule : ObjectIDModule.default

import type { ValueToTranslate } from './types.js'

import { isEmpty } from '../utils/isEmpty.js'
import { traverseRichText } from './traverseRichText.js'

export const traverseFields = ({
  dataFrom,
  emptyOnly,
  fields,
  localizedParent,
  payloadConfig,
  siblingDataFrom,
  siblingDataTranslated,
  translatedData,
  valuesToTranslate,
}: {
  dataFrom: Record<string, unknown>
  emptyOnly: boolean
  fields: Field[]
  localizedParent?: boolean
  payloadConfig: SanitizedConfig
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

    switch (field.type) {
      case 'array': {
        const arrayDataFrom = siblingDataFrom[field.name] as {
          id: string
        }[]

        if (isEmpty(arrayDataFrom)) {
          break
        }

        let arrayDataTranslated =
          (siblingDataTranslated[field.name] as { id: string }[] | undefined) ?? []

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
            dataFrom,
            emptyOnly,
            fields: field.fields,
            localizedParent: localizedParent ?? field.localized,
            payloadConfig,
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
          id: string
        }[]

        if (isEmpty(blocksDataFrom)) {
          break
        }

        let blocksDataTranslated =
          (siblingDataTranslated[field.name] as { blockType: string; id: string }[] | undefined) ??
          []

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
            dataFrom,
            emptyOnly,
            fields: blockConfig.fields,
            localizedParent: localizedParent ?? field.localized,
            payloadConfig,
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
          dataFrom,
          emptyOnly,
          fields: field.fields,
          localizedParent,
          payloadConfig,
          siblingDataFrom,
          siblingDataTranslated,
          translatedData,
          valuesToTranslate,
        })
        break
      case 'group': {
        if (!('name' in field)) {
          // TODO: handle unnamed groups
          throw new Error('Unnamed groups are currently not supported by this plugin.')
        }

        const groupDataFrom = siblingDataFrom[field.name] as Record<string, unknown>

        if (!groupDataFrom) {
          break
        }

        const groupDataTranslated =
          (siblingDataTranslated[field.name] as Record<string, unknown>) ?? {}

        traverseFields({
          dataFrom,
          emptyOnly,
          fields: field.fields,
          localizedParent: field.localized,
          payloadConfig,
          siblingDataFrom: groupDataFrom,
          siblingDataTranslated: groupDataTranslated,
          translatedData,
          valuesToTranslate,
        })

        break
      }
      case 'richText': {
        if (field.custom && typeof field.custom === 'object' && field.custom.translatorSkip) {
          break
        }

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
            onText: (siblingData, key) => {
              valuesToTranslate.push({
                onTranslate: (translated: string) => {
                  siblingData[key] = translated
                },
                value: siblingData[key],
              })
            },
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
            dataFrom,
            emptyOnly,
            fields: tab.fields,
            localizedParent: tab.localized,
            payloadConfig,
            siblingDataFrom: tabDataFrom,
            siblingDataTranslated: tabDataTranslated,
            translatedData,
            valuesToTranslate,
          })
        }

        break
      case 'text':
      case 'textarea':
        if (field.custom && typeof field.custom === 'object' && field.custom.translatorSkip) {
          break
        }

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

        valuesToTranslate.push({
          onTranslate: (translated: string) => {
            siblingDataTranslated[field.name] = translated
          },
          value: siblingDataFrom[field.name],
        })
        break

      default:
        break
    }
  }
}
