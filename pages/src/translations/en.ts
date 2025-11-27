import type { GenericTranslationsObject } from './index.js'

export const en: GenericTranslationsObject = {
  $schema: './translation-schema.json',
  '@jhb.software/payload-pages-plugin': {
    slug: 'Slug',
    alternatePath: 'Alternate Path',
    alternatePaths: 'Alternate Paths',
    breadcrumb: 'Breadcrumb',
    breadcrumbs: 'Breadcrumbs',
    createRedirect: 'Create Redirect',
    creating: 'Creating...',
    creatingRedirect: 'Creating redirect...',
    isRootPage: 'is Root Page',
    label: 'Label',
    parent: 'Parent Page',
    path: 'Path',
    redirectCreated: 'Redirect Created',
    redirectCreatedSuccessfully: 'Redirect created successfully',
    redirectCreationFailed: 'Failed to create redirect',
    redirectReasonSlugChange: 'Automatic redirect due to slug change',
    revertSlug: 'Revert change',
    rootPage: 'Root Page',
    showBreadcrumbs: 'Show Breadcrumbs',
    slugWasChangedFromXToY:
      'The slug was changed from <code>{X}</code> to <code>{Y}</code>. A redirect from the old to the new path is required.',
    syncSlugWithX: 'Sync with {X}',
  },
}
