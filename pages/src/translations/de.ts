import type { GenericTranslationsObject } from './index.js'

export const de: GenericTranslationsObject = {
  $schema: './translation-schema.json',
  '@jhb.software/payload-pages-plugin': {
    slug: 'URL-Endung',
    alternatePath: 'Alternative Pfad',
    alternatePaths: 'Alternative Pfade',
    breadcrumb: 'Navigationspfad',
    breadcrumbs: 'Navigationspfade',
    createRedirect: 'Weiterleitung erstellen',
    creating: 'Erstelle...',
    creatingRedirect: 'Erstelle Weiterleitung...',
    isRootPage: 'ist Startseite',
    label: 'Beschriftung',
    parent: 'Übergeordnete Seite',
    path: 'Pfad',
    redirectCreated: 'Weiterleitung erstellt',
    redirectCreatedSuccessfully: 'Weiterleitung erfolgreich erstellt',
    redirectCreationFailed: 'Weiterleitung konnte nicht erstellt werden',
    redirectReasonSlugChange: 'Automatische Weiterleitung aufgrund von Slug-Änderung',
    revertSlug: 'Änderung verwerfen',
    rootPage: 'Startseite',
    showBreadcrumbs: 'Navigationspfade anzeigen',
    slugWasChangedFromXToY:
      'Die URL-Endung wurde von <code>{X}</code> zu <code>{Y}</code> geändert. Eine Weiterleitung vom alten zum neuen Pfad ist erforderlich.',
    syncSlugWithX: 'Mit {X} synchronisieren',
  },
}
