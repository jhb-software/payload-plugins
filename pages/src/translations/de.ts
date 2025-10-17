import { GenericTranslationsObject } from './index.js'

export const de: GenericTranslationsObject = {
  $schema: './translation-schema.json',
  '@jhb.software/payload-pages-plugin': {
    path: 'Pfad',
    label: 'Beschriftung',
    slug: 'URL-Endung',
    parent: 'Übergeordnete Seite',
    rootPage: 'Startseite',
    isRootPage: 'ist Startseite',
    alternatePaths: 'Alternative Pfade',
    alternatePath: 'Alternative Pfad',
    breadcrumbs: 'Navigationspfade',
    breadcrumb: 'Navigationspfad',
    syncSlugWithX: 'Mit {X} synchronisieren',
    slugWasChangedFromXToY:
      'Die URL-Endung wurde von <code>{X}</code> zu <code>{Y}</code> geändert. Dies erfordert eine manuelle Erstellung einer Umleitung vom alten zum neuen Seitenpfad.',
  },
}
