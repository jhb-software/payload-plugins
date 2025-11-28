import type { CollectionConfig } from 'payload'

import type {
  PageCollectionConfigAttributes,
  SanitizedPageCollectionConfigAttributes,
} from '../types/PageCollectionConfigAttributes.js'
import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { breadcrumbsField } from '../fields/breadcrumbsField.js'
import { isRootPageField } from '../fields/isRootPageField.js'
import { parentField } from '../fields/parentField.js'
import { pathField } from '../fields/pathField.js'
import { pageSlugField } from '../fields/slugField.js'
import { beforeDuplicateTitle } from '../hooks/beforeDuplicate.js'
import { preventParentDeletion } from '../hooks/preventParentDeletion.js'
import { selectDependentFieldsBeforeOperation } from '../hooks/selectDependentFieldsBeforeOperation.js'
import {
  setVirtualFieldsAfterChange,
  setVirtualFieldsBeforeRead,
} from '../hooks/setVirtualFields.js'

/**
 * Sanitizes the page collection config by applying defaults.
 */
export const sanitizePageCollectionConfig = (
  incoming: PageCollectionConfigAttributes,
  collectionConfig: CollectionConfig,
): SanitizedPageCollectionConfigAttributes => {
  return {
    slug: {
      fallbackField: incoming.slug?.fallbackField ?? collectionConfig.admin?.useAsTitle ?? 'title',
      staticValue: incoming.slug?.staticValue,
      unique: incoming.slug?.unique ?? true,
    },
    breadcrumbs: {
      labelField: incoming.breadcrumbs?.labelField ?? collectionConfig.admin?.useAsTitle ?? 'title',
    },
    isRootCollection: incoming.isRootCollection ?? false,
    livePreview: incoming.livePreview ?? true,
    parent: {
      name: incoming.parent.name,
      collection: incoming.parent.collection,
      sharedDocument: incoming.parent.sharedDocument ?? false,
    },
    preview: incoming.preview ?? true,
  }
}

/**
 * Creates a collection config for a page-like collection by adding:
 * - Page attributes as custom attributes for use in hooks
 * - Required parent relationship field in the sidebar
 * - Hidden breadcrumbs array field
 * - Hooks for managing virtual fields and page duplication
 */
export const createPageCollectionConfig = ({
  collectionConfig: incomingCollectionConfig,
  pluginConfig,
}: {
  collectionConfig: CollectionConfig
  pluginConfig: PagesPluginConfig
}): CollectionConfig => {
  // Get page config from custom.pagesPlugin.page (type-safe via module augmentation)
  const pagesPlugin = incomingCollectionConfig.custom?.pagesPlugin
  const incomingPageConfig = pagesPlugin && 'page' in pagesPlugin ? pagesPlugin.page : undefined

  if (!incomingPageConfig) {
    throw new Error(
      `Collection "${incomingCollectionConfig.slug}" is missing custom.pagesPlugin.page configuration`,
    )
  }

  // Sanitize the incoming config (apply defaults)
  const sanitizedPageConfig = sanitizePageCollectionConfig(
    incomingPageConfig,
    incomingCollectionConfig,
  )

  return {
    ...incomingCollectionConfig,
    admin: {
      ...incomingCollectionConfig.admin,
      livePreview: {
        ...incomingCollectionConfig.admin?.livePreview,
        url:
          incomingCollectionConfig.admin?.livePreview?.url ??
          (sanitizedPageConfig.livePreview
            ? ({ data, req }) =>
                pluginConfig.generatePageURL({
                  data,
                  path: 'path' in data && typeof data.path === 'string' ? data.path : null,
                  preview: true,
                  req,
                })
            : undefined),
      },
      preview:
        incomingCollectionConfig.admin?.preview ??
        (sanitizedPageConfig.preview
          ? (data, options) =>
              pluginConfig.generatePageURL({
                data,
                path: 'path' in data && typeof data.path === 'string' ? data.path : null,
                preview: true,
                req: options.req,
              })
          : undefined),
    },
    custom: {
      ...incomingCollectionConfig.custom,
      pagesPlugin: {
        // Keep the original incoming config
        page: incomingPageConfig,
        // Store the sanitized config for internal use
        _page: sanitizedPageConfig,
      },
    },
    fields: [
      ...(sanitizedPageConfig.isRootCollection
        ? [
            isRootPageField({
              baseFilter: pluginConfig.baseFilter,
            }),
          ]
        : []),
      pageSlugField({
        fallbackField: sanitizedPageConfig.slug.fallbackField,
        staticValue: sanitizedPageConfig.slug.staticValue,
        unique: sanitizedPageConfig.slug.unique,
      }),
      parentField(sanitizedPageConfig, incomingCollectionConfig.slug, pluginConfig.baseFilter),
      pathField(),
      breadcrumbsField(),
      // add the user defined fields below the fields defined by the plugin to ensure a correct order in the sidebar

      // add the beforeDuplicate hook to the title field
      ...incomingCollectionConfig.fields.map((field) =>
        'name' in field &&
        field.name === (incomingCollectionConfig.admin?.useAsTitle ?? 'title') &&
        field.type === 'text'
          ? {
              ...field,
              hooks: {
                ...field.hooks,
                beforeDuplicate: [...(field.hooks?.beforeDuplicate || []), beforeDuplicateTitle],
              },
            }
          : field,
      ),
    ],
    hooks: {
      ...incomingCollectionConfig.hooks,
      afterChange: [
        ...(incomingCollectionConfig.hooks?.afterChange || []),
        setVirtualFieldsAfterChange,
      ],
      beforeDelete: [
        ...(incomingCollectionConfig.hooks?.beforeDelete || []),
        ...(pluginConfig.preventParentDeletion !== false ? [preventParentDeletion] : []),
      ],
      beforeOperation: [
        ...(incomingCollectionConfig.hooks?.beforeOperation || []),
        selectDependentFieldsBeforeOperation,
      ],
      beforeRead: [
        ...(incomingCollectionConfig.hooks?.beforeRead || []),
        setVirtualFieldsBeforeRead,
      ],
    },
  }
}
