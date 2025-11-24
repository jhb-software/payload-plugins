import { GenericTranslationsObject } from './index.js'

export const en: GenericTranslationsObject = {
  $schema: './translation-schema.json',
  '@jhb.software/payload-pages-plugin': {
    path: 'Path',
    label: 'Label',
    slug: 'Slug',
    parent: 'Parent Page',
    rootPage: 'Root Page',
    isRootPage: 'is Root Page',
    alternatePaths: 'Alternate Paths',
    alternatePath: 'Alternate Path',
    breadcrumbs: 'Breadcrumbs',
    breadcrumb: 'Breadcrumb',
    showBreadcrumbs: 'Show Breadcrumbs',
    syncSlugWithX: 'Sync with {X}',
    slugWasChangedFromXToY:
      'The slug was changed from {X} to {Y}. A redirect from the old to the new path is required.',
    createRedirect: 'Create Redirect',
    redirectCreated: 'Redirect Created',
    creatingRedirect: 'Creating redirect...',
    redirectCreatedSuccessfully: 'Redirect created successfully',
    redirectCreationFailed: 'Failed to create redirect',
    redirectReasonSlugChange: 'Automatic redirect due to slug change',
    creating: 'Creating...',
    revertSlug: 'Revert change',
  },
}
