import type { CollectionConfig, PayloadRequest } from 'payload'

import type {
  IncomingPageCollectionConfig,
  PageCollectionConfig,
} from '../types/PageCollectionConfig.js'
import type { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'
import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { breadcrumbsField } from '../fields/breadcrumbsField.js'
import { isRootPageField } from '../fields/isRootPageField.js'
import { parentField } from '../fields/parentField.js'
import { pathField } from '../fields/pathField.js'
import { pageSlugField } from '../fields/slugField.js'
import { beforeDuplicateTitle } from '../hooks/beforeDuplicate.js'
import {
  capturePreviousPathsBeforeChange,
  capturePreviousPathsBeforeDelete,
} from '../hooks/capturePreviousPaths.js'
import { preventCircularParentReference } from '../hooks/preventCircularParentReference.js'
import { preventParentDeletion, preventParentTrashing } from '../hooks/preventParentDeletion.js'
import { restoreOperationDraftAfterOperation } from '../hooks/restoreOperationDraftAfterOperation.js'
import { selectDependentFieldsBeforeOperation } from '../hooks/selectDependentFieldsBeforeOperation.js'
import {
  setVirtualFieldsAfterChange,
  setVirtualFieldsBeforeRead,
} from '../hooks/setVirtualFields.js'
import { stripAutoSelectedFieldsAfterOperation } from '../hooks/stripAutoSelectedFieldsAfterOperation.js'

/**
 * Resolve the page attributes, applying the plugin's defaults to the incoming
 * config. The slug and breadcrumb label fall back to `useAsTitle`.
 */
const resolvePageConfig = (
  incomingCollectionConfig: IncomingPageCollectionConfig,
): PageCollectionConfigAttributes => {
  const { admin, page } = incomingCollectionConfig

  return {
    slug: {
      fallbackField: page.slug?.fallbackField ?? admin?.useAsTitle ?? 'title',
      staticValue: page.slug?.staticValue,
      unique: page.slug?.unique ?? true,
    },
    breadcrumbs: {
      labelField: page.breadcrumbs?.labelField ?? admin?.useAsTitle ?? 'title',
    },
    isRootCollection: page.isRootCollection ?? false,
    livePreview: page.livePreview ?? true,
    parent: {
      name: page.parent.name,
      collection: page.parent.collection,
      sharedDocument: page.parent.sharedDocument ?? false,
    },
    preview: page.preview ?? true,
  }
}

/** The document's own path, or `null` while it has not been computed yet. */
const pathFromData = (data: Record<string, unknown>): null | string =>
  'path' in data && typeof data.path === 'string' ? data.path : null

/**
 * Point the admin's live preview and preview buttons at the page URL derived
 * from the document's path. An explicit setting in the incoming config always
 * wins; the plugin only fills in what the collection did not define itself.
 */
const buildAdminConfig = (
  incomingCollectionConfig: IncomingPageCollectionConfig,
  pageConfig: PageCollectionConfigAttributes,
  pluginConfig: PagesPluginConfig,
): CollectionConfig['admin'] => {
  const { admin } = incomingCollectionConfig

  const previewURL = (data: Record<string, unknown>, req: PayloadRequest) =>
    pluginConfig.generatePageURL({ data, path: pathFromData(data), preview: true, req })

  return {
    ...admin,
    livePreview: {
      ...admin?.livePreview,
      url:
        admin?.livePreview?.url ??
        (pageConfig.livePreview ? ({ data, req }) => previewURL(data, req) : undefined),
    },
    preview:
      admin?.preview ?? (pageConfig.preview ? (data, { req }) => previewURL(data, req) : undefined),
  }
}

/** Attach the beforeDuplicate hook to the collection's title field. */
const withBeforeDuplicateTitle = (
  incomingCollectionConfig: IncomingPageCollectionConfig,
): IncomingPageCollectionConfig['fields'] => {
  const titleField = incomingCollectionConfig.admin?.useAsTitle ?? 'title'

  return incomingCollectionConfig.fields.map((field) => {
    if (!('name' in field) || field.name !== titleField || field.type !== 'text') {
      return field
    }

    return {
      ...field,
      hooks: {
        ...field.hooks,
        beforeDuplicate: [...(field.hooks?.beforeDuplicate || []), beforeDuplicateTitle],
      },
    }
  })
}

const buildFields = (
  incomingCollectionConfig: IncomingPageCollectionConfig,
  pageConfig: PageCollectionConfigAttributes,
  pluginConfig: PagesPluginConfig,
): PageCollectionConfig['fields'] => {
  const { page } = incomingCollectionConfig

  return [
    ...(pageConfig.isRootCollection
      ? [
          isRootPageField({
            admin: page.isRootPage?.admin,
            baseFilter: pluginConfig.baseFilter,
          }),
        ]
      : []),
    // Overrides are read from the incoming config, not from `pageConfig`:
    // that one is exposed to the admin client via `custom.pageConfig`, where
    // functions would not survive serialization.
    pageSlugField({
      admin: page.slug?.admin,
      fallbackField: pageConfig.slug.fallbackField,
      staticValue: pageConfig.slug.staticValue,
      unique: pageConfig.slug.unique,
    }),
    parentField(pageConfig, incomingCollectionConfig.slug, pluginConfig.baseFilter, {
      admin: page.parent.admin,
      filterOptions: page.parent.filterOptions,
    }),
    pathField({ admin: page.path?.admin }),
    breadcrumbsField({ admin: page.breadcrumbs?.admin }),
    // add the user defined fields below the fields defined by the plugin to ensure a correct order in the sidebar
    ...withBeforeDuplicateTitle(incomingCollectionConfig),
  ]
}

const buildHooks = (
  incomingCollectionConfig: IncomingPageCollectionConfig,
  pluginConfig: PagesPluginConfig,
): PageCollectionConfig['hooks'] => {
  const { hooks } = incomingCollectionConfig
  const guardParentDeletion = pluginConfig.preventParentDeletion !== false

  return {
    ...hooks,
    afterChange: [setVirtualFieldsAfterChange, ...(hooks?.afterChange || [])],
    afterOperation: [
      // Runs before the user's hooks so a nested read one of them makes is a sibling of the
      // finished operation rather than a child of it
      restoreOperationDraftAfterOperation,
      ...(hooks?.afterOperation || []),
      // Runs last so that a user hook cannot reintroduce the auto-selected fields into the response
      stripAutoSelectedFieldsAfterOperation,
    ],
    beforeChange: [
      ...(hooks?.beforeChange || []),
      preventCircularParentReference,
      ...(guardParentDeletion ? [preventParentTrashing] : []),
      // Runs after the guards so a refused write never pays for a capture read
      capturePreviousPathsBeforeChange,
    ],
    beforeDelete: [
      ...(hooks?.beforeDelete || []),
      ...(guardParentDeletion ? [preventParentDeletion] : []),
      capturePreviousPathsBeforeDelete,
    ],
    beforeOperation: [...(hooks?.beforeOperation || []), selectDependentFieldsBeforeOperation],
    beforeRead: [...(hooks?.beforeRead || []), setVirtualFieldsBeforeRead],
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
  collectionConfig: IncomingPageCollectionConfig
  pluginConfig: PagesPluginConfig
}): PageCollectionConfig => {
  const pageConfig = resolvePageConfig(incomingCollectionConfig)

  return {
    ...incomingCollectionConfig,
    admin: buildAdminConfig(incomingCollectionConfig, pageConfig, pluginConfig),
    custom: {
      ...incomingCollectionConfig.custom,
      // This makes the page attributes available in hooks etc.
      pageConfig,
      pagesPluginConfig: pluginConfig,
    },
    fields: buildFields(incomingCollectionConfig, pageConfig, pluginConfig),
    hooks: buildHooks(incomingCollectionConfig, pluginConfig),
    page: pageConfig,
  }
}
