import { CollectionConfig } from 'payload'
import { breadcrumbsField } from '../fields/breadcrumbsField'
import { parentField } from '../fields/parentField'
import { pathField } from '../fields/pathField'
import { previewButtonField } from '../fields/previewButtonField'
import { slugField } from '../fields/slugField'
import { beforeDuplicateTitle } from '../hooks/beforeDuplicate'
import { setVirtualFieldsAfterChange, setVirtualFieldsBeforeRead } from '../hooks/setVirtualFields'
import { PageCollectionConfig } from '../types/PageCollectionConfig'
import { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes'

/**
 * Creates a collection config for a page-like collection by adding:
 * - Page attributes as custom attributes for use in hooks
 * - Required parent relationship field in the sidebar
 * - Hidden breadcrumbs array field
 * - Hooks for managing virtual fields and page duplication
 */
export const createPageCollectionConfig = (config: PageCollectionConfig): PageCollectionConfig => {
  const titleField = config.page.breadcrumbLabelField ?? config.admin?.useAsTitle ?? 'title'

  const pageConfig = {
    ...config.page,
    breadcrumbLabelField: titleField,
    sharedParentDocument: config.page.sharedParentDocument ?? false,
    isRootCollection: config.page.isRootCollection ?? false,
    slugFallbackField: config.page.slugFallbackField ?? 'title',
  } as PageCollectionConfigAttributes

  return {
    ...config,
    custom: {
      ...config.custom,
      // This makes the page attributes available in hooks etc.
      pageConfig,
    },
    page: pageConfig,
    hooks: {
      ...config.hooks,
      beforeRead: [...(config.hooks?.beforeRead || []), setVirtualFieldsBeforeRead],
      afterChange: [...(config.hooks?.afterChange || []), setVirtualFieldsAfterChange],
    },
    fields: [
      previewButtonField(),
      slugField({ redirectWarning: true, fallbackField: pageConfig.slugFallbackField }),
      parentField(pageConfig),
      pathField(),
      breadcrumbsField(),
      // add the user defined fields below the fields defined by the plugin to ensure a correct order in the sidebar

      // add the beforeDuplicate hook to the title field
      ...config.fields.map((field) =>
        'name' in field && field.name === titleField
          ? {
              ...field,
              hooks: {
                beforeDuplicate: [beforeDuplicateTitle],
              },
            }
          : field,
      ),
    ],
  }
}

/** Checks if the config is a PageCollectionConfig. */
export const isPageCollectionConfig = (
  config: CollectionConfig,
): config is PageCollectionConfig => {
  if (!config) {
    console.error('config is not defined')
    return false
  }

  return 'page' in config && typeof config.page === 'object'
}

/**
 * Returns the PageCollectionConfig or null if the config is not a PageCollectionConfig.
 *
 * This provides type-safe access to the page attributes.
 */
export const asPageCollectionConfig = (config: CollectionConfig): PageCollectionConfig | null => {
  if (isPageCollectionConfig(config)) {
    return config
  }
  return null
}

/**
 * Returns the PageCollectionConfig or throws an error if the config is not a PageCollectionConfig.
 *
 * This provides type-safe access to the page attributes.
 */
export const asPageCollectionConfigOrThrow = (config: CollectionConfig): PageCollectionConfig => {
  if (isPageCollectionConfig(config)) {
    return config
  }

  throw new Error('Collection is not a page collection')
}
