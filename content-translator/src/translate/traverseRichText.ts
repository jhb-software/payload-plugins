import type { FlattenedBlock, SanitizedConfig } from 'payload'

import type { ValueToTranslate } from './types.js'

import { traverseFields } from './traverseFields.js'

export const traverseRichText = ({
  emptyOnly,
  onText,
  payloadConfig,
  root,
  siblingData,
  translatedData,
  valuesToTranslate,
}: {
  emptyOnly: boolean
  onText: (siblingData: Record<string, unknown>, key: string) => void
  payloadConfig: SanitizedConfig
  root: Record<string, unknown>
  siblingData?: Record<string, unknown>
  translatedData: Record<string, unknown>
  valuesToTranslate: ValueToTranslate[]
}) => {
  siblingData = siblingData ?? root

  if (siblingData.text) {
    onText(siblingData, 'text')
  }

  if (siblingData.type === 'block') {
    if (
      'fields' in siblingData &&
      siblingData.fields &&
      typeof siblingData.fields === 'object' &&
      'blockType' in siblingData.fields &&
      typeof siblingData.fields.blockType === 'string' &&
      siblingData.fields.blockType
    ) {
      const blockData = siblingData.fields as Record<string, unknown>
      const blockName = siblingData.fields.blockType

      const blockConfig = findBlockConfigBySlug(blockName, payloadConfig)

      if (blockConfig) {
        // Traverse the fields of the block
        traverseFields({
          dataFrom: root,
          emptyOnly,
          fields: blockConfig.fields,
          localizedParent: false,
          payloadConfig,
          siblingDataFrom: blockData,
          siblingDataTranslated: blockData,
          translatedData,
          valuesToTranslate,
        })
      }
    } else {
      console.warn('Could not find fields and blockType in block', siblingData)
    }
  } else if (Array.isArray(siblingData?.children)) {
    for (const child of siblingData.children) {
      traverseRichText({
        emptyOnly,
        onText,
        payloadConfig,
        root,
        siblingData: child,
        translatedData,
        valuesToTranslate,
      })
    }
  }
}

const findBlockConfigBySlug = (
  slug: string,
  payloadConfig: SanitizedConfig,
): FlattenedBlock | undefined => {
  const payloadBlockConfig = payloadConfig.blocks?.find((block) => block.slug === slug)
  if (payloadBlockConfig) {
    return payloadBlockConfig
  }

  // If not found anywhere, warn and return undefined
  console.warn(
    `Could not find block config for lexical block with slug ${slug} in the payload config blocks array.`,
  )

  // In Payload v4, the option for defining block configs inside of fields will be removed in favor of the
  // global blocks array in the payload config. Therefore this function only supports the global blocks array.
  // See https://github.com/payloadcms/payload/pull/10905

  return undefined
}
