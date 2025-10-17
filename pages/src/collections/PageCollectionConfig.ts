import { breadcrumbsField } from '../fields/breadcrumbsField.js'
import { isRootPageField } from '../fields/isRootPageField.js'
import { parentField } from '../fields/parentField.js'
import { pathField } from '../fields/pathField.js'
import { pageSlugField } from '../fields/slugField.js'
import { beforeDuplicateTitle } from '../hooks/beforeDuplicate.js'
import { selectDependentFieldsBeforeOperation } from '../hooks/selectDependentFieldsBeforeOperation.js'
import { preventParentDeletion } from '../hooks/preventParentDeletion.js'
import {
  setVirtualFieldsAfterChange,
  setVirtualFieldsBeforeRead,
} from '../hooks/setVirtualFields.js'
import {
  IncomingPageCollectionConfig,
  PageCollectionConfig,
} from '../types/PageCollectionConfig.js'

import { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'
import { PagesPluginConfig } from '../types/PagesPluginConfig.js'
import { deleteUnselectedFieldsAfterRead } from '../hooks/deleteUnselectedFieldsAfterRead.js'

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
  collectionConfig: IncomingPageCollectionConfig
  pluginConfig: PagesPluginConfig
}): PageCollectionConfig => {
  const pageConfig: PageCollectionConfigAttributes = {
    isRootCollection: incomingCollectionConfig.page.isRootCollection ?? false,
    parent: {
      collection: incomingCollectionConfig.page.parent.collection,
      name: incomingCollectionConfig.page.parent.name,
      sharedDocument: incomingCollectionConfig.page.parent.sharedDocument ?? false,
    },
    breadcrumbs: {
      labelField:
        incomingCollectionConfig.page.breadcrumbs?.labelField ??
        incomingCollectionConfig.admin?.useAsTitle ??
        'title',
    },
    slug: {
      fallbackField:
        incomingCollectionConfig.page?.slug?.fallbackField ??
        incomingCollectionConfig.admin?.useAsTitle ??
        'title',
      unique: incomingCollectionConfig.page?.slug?.unique ?? true,
      staticValue: incomingCollectionConfig.page?.slug?.staticValue,
    },
    preview: incomingCollectionConfig.page?.preview ?? true,
    livePreview: incomingCollectionConfig.page?.livePreview ?? true,
  }

  return {
    ...incomingCollectionConfig,
    admin: {
      ...incomingCollectionConfig.admin,
      livePreview: {
        ...incomingCollectionConfig.admin?.livePreview,
        url:
          incomingCollectionConfig.admin?.livePreview?.url ??
          (pageConfig.livePreview
            ? ({ data, req }) =>
                pluginConfig.generatePageURL({
                  path: 'path' in data && typeof data.path === 'string' ? data.path : null,
                  preview: true,
                  data: data,
                  req: req,
                })
            : undefined),
      },
      preview:
        incomingCollectionConfig.admin?.preview ??
        (pageConfig.preview
          ? (data, options) =>
              pluginConfig.generatePageURL({
                path: 'path' in data && typeof data.path === 'string' ? data.path : null,
                preview: true,
                data: data,
                req: options.req,
              })
          : undefined),
    },
    custom: {
      ...incomingCollectionConfig.custom,
      // This makes the page attributes available in hooks etc.
      pageConfig,
      pagesPluginConfig: pluginConfig,
    },
    page: pageConfig,
    hooks: {
      ...incomingCollectionConfig.hooks,
      beforeOperation: [
        ...(incomingCollectionConfig.hooks?.beforeOperation || []),
        selectDependentFieldsBeforeOperation,
      ],
      beforeRead: [
        ...(incomingCollectionConfig.hooks?.beforeRead || []),
        setVirtualFieldsBeforeRead,
      ],
      afterRead: [
        ...(incomingCollectionConfig.hooks?.afterRead || []),
        deleteUnselectedFieldsAfterRead,
      ],
      afterChange: [
        ...(incomingCollectionConfig.hooks?.afterChange || []),
        setVirtualFieldsAfterChange,
      ],
      beforeDelete: [
        ...(incomingCollectionConfig.hooks?.beforeDelete || []),
        ...(pluginConfig.preventParentDeletion !== false ? [preventParentDeletion] : []),
      ],
    },
    fields: [
      ...(pageConfig.isRootCollection
        ? [
            isRootPageField({
              baseFilter: pluginConfig.baseFilter,
            }),
          ]
        : []),
      pageSlugField({
        fallbackField: pageConfig.slug.fallbackField,
        unique: pageConfig.slug.unique,
        staticValue: pageConfig.slug.staticValue,
      }),
      parentField(pageConfig, incomingCollectionConfig.slug, pluginConfig.baseFilter),
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
  }
}
