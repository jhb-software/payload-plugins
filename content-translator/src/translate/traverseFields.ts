import type { Field, SanitizedConfig } from 'payload'

import ObjectIDModule from 'bson-objectid'
import { tabHasName } from 'payload/shared'

const ObjectID = typeof ObjectIDModule === 'function' ? ObjectIDModule : ObjectIDModule.default

import type { IncrementalAccumulator, TranslateMode, ValueToTranslate } from './types.js'

import { isEmpty } from '../utils/isEmpty.js'
import { hashNode, hashText, nodePlainText } from './richtext/hashNode.js'
import { setNodeHashes } from './richtext/nodeState.js'
import { reconcileIncremental } from './richtext/reconcileIncremental.js'
import { traverseRichText } from './traverseRichText.js'

const isUnsafeKey = (key: string): boolean =>
  key === '__proto__' || key === 'constructor' || key === 'prototype'

export const traverseFields = ({
  dataFrom,
  fields,
  incremental,
  localizedParent,
  mode,
  payloadConfig,
  siblingDataFrom,
  siblingDataTranslated,
  translatedData,
  valuesToTranslate,
}: {
  dataFrom: Record<string, unknown>
  fields: Field[]
  incremental?: IncrementalAccumulator
  localizedParent?: boolean
  mode: TranslateMode
  payloadConfig: SanitizedConfig
  siblingDataFrom?: Record<string, unknown>
  siblingDataTranslated?: Record<string, unknown>
  translatedData: Record<string, unknown>
  valuesToTranslate: ValueToTranslate[]
}) => {
  siblingDataFrom = siblingDataFrom ?? dataFrom
  siblingDataTranslated = siblingDataTranslated ?? translatedData
  incremental = incremental ?? { conflictCount: 0, stamps: [] }

  // LIMITATION: change detection only works for lexical richText. `incremental`
  // does node-level diffing of lexical paragraphs/blocks (see the richText case
  // below); for every other field type it falls back to empty-only here. So a
  // text/textarea/number/array/blocks value whose SOURCE changed after it was
  // already translated is NOT retranslated in incremental mode — only fields
  // that are still empty get filled. Catching edits on those would need a hash
  // of the source stored per field (plain fields have no NodeState slot to carry
  // it inline, unlike lexical nodes), i.e. the sidecar approach — out of scope
  // here. Despite the "new & changed" label, "changed" currently means lexical
  // content only.
  const fillEmptyOnly = mode !== 'all'

  for (const field of fields) {
    if ('virtual' in field && field.virtual) {
      continue
    }

    if ('name' in field && isUnsafeKey(field.name)) {
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
          if (arrayDataTranslated.length > 0 && fillEmptyOnly) {
            break
          }

          arrayDataTranslated = arrayDataFrom.map(() => ({
            id: ObjectID().toHexString(),
          }))
        }

        arrayDataTranslated.forEach((item, index) => {
          traverseFields({
            dataFrom,
            fields: field.fields,
            incremental,
            localizedParent: localizedParent ?? field.localized,
            mode,
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
          if (blocksDataTranslated.length > 0 && fillEmptyOnly) {
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
            fields: blockConfig.fields,
            incremental,
            localizedParent: localizedParent ?? field.localized,
            mode,
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
          fields: field.fields,
          incremental,
          localizedParent,
          mode,
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
          fields: field.fields,
          incremental,
          localizedParent: field.localized,
          mode,
          payloadConfig,
          siblingDataFrom: groupDataFrom,
          siblingDataTranslated: groupDataTranslated,
          translatedData,
          valuesToTranslate,
        })

        siblingDataTranslated[field.name] = groupDataTranslated

        break
      }
      case 'richText': {
        if (field.custom && typeof field.custom === 'object' && field.custom.translatorSkip) {
          break
        }

        if (!(field.localized || localizedParent) || isEmpty(siblingDataFrom[field.name])) {
          break
        }

        const richTextDataFrom = siblingDataFrom[field.name] as Record<string, unknown>

        if (!richTextDataFrom) {
          break
        }

        const isLexical = 'root' in richTextDataFrom
        const existingTarget = siblingDataTranslated[field.name]

        // Incremental: diff source against the existing translation at the
        // paragraph/block level instead of skipping or wholesale-replacing.
        if (mode === 'incremental' && isLexical && !isEmpty(existingTarget)) {
          const sourceRoot = richTextDataFrom.root as Record<string, unknown>
          const targetRoot = (existingTarget as Record<string, unknown>).root as Record<
            string,
            unknown
          >

          const { children, conflictCount, stamps } = reconcileIncremental({
            collectUnitTexts: (unitNode) => {
              traverseRichText({
                incremental,
                mode: 'all',
                onText: (siblingData, key) => {
                  valuesToTranslate.push({
                    onTranslate: (translated: string) => {
                      siblingData[key] = translated
                    },
                    value: siblingData[key],
                  })
                },
                payloadConfig,
                root: unitNode,
                translatedData,
                valuesToTranslate,
              })
            },
            sourceChildren: (sourceRoot?.children as Record<string, unknown>[]) ?? [],
            targetChildren: (targetRoot?.children as Record<string, unknown>[]) ?? [],
          })

          siblingDataTranslated[field.name] = {
            ...richTextDataFrom,
            root: { ...sourceRoot, children },
          }
          incremental.stamps.push(...stamps)
          incremental.conflictCount += conflictCount

          break
        }

        // empty: leave an already-translated field untouched.
        if (fillEmptyOnly && !isEmpty(existingTarget)) {
          break
        }

        // all (and incremental over an empty target, or non-lexical): copy the
        // source tree and translate every text node.
        siblingDataTranslated[field.name] = richTextDataFrom

        if (!isLexical) {
          break
        }

        const root = (siblingDataTranslated[field.name] as Record<string, unknown>)?.root as Record<
          string,
          unknown
        >

        if (root) {
          traverseRichText({
            incremental,
            mode,
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

          // Stamp every top-level node so a later incremental run has the
          // content-addressed hashes to join on. Capture srcHash now (before the
          // deferred onTranslate mutates the text) and outHash after.
          if (Array.isArray(root.children)) {
            for (const child of root.children as Record<string, unknown>[]) {
              const srcHash = hashNode(child)
              incremental.stamps.push(() =>
                setNodeHashes(child, srcHash, hashText(nodePlainText(child))),
              )
            }
          }
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
            dataFrom,
            fields: tab.fields,
            incremental,
            localizedParent: tab.localized,
            mode,
            payloadConfig,
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
      case 'textarea':
        if (field.custom && typeof field.custom === 'object' && field.custom.translatorSkip) {
          break
        }

        if (!(field.localized || localizedParent) || isEmpty(siblingDataFrom[field.name])) {
          break
        }
        if (fillEmptyOnly && siblingDataTranslated[field.name]) {
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
