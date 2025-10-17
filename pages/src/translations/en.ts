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
    syncSlugWithX: 'Sync with {X}',
    slugWasChangedFromXToY:
      'The slug was changed from <code>{X}</code> to <code>{Y}</code>. This requires a redirection from the old to the new page path to be manually created.',
  },
}
