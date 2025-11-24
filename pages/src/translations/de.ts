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
    showBreadcrumbs: 'Navigationspfade anzeigen',
    syncSlugWithX: 'Mit {X} synchronisieren',
    slugWasChangedFromXToY:
      'Die URL-Endung wurde von <code>{X}</code> zu <code>{Y}</code> geändert. Eine Weiterleitung vom alten zum neuen Pfad ist erforderlich.',
    createRedirect: 'Weiterleitung erstellen',
    redirectCreated: 'Weiterleitung erstellt',
    creatingRedirect: 'Erstelle Weiterleitung...',
    redirectCreatedSuccessfully: 'Weiterleitung erfolgreich erstellt',
    redirectCreationFailed: 'Weiterleitung konnte nicht erstellt werden',
    redirectReasonSlugChange: 'Automatische Weiterleitung aufgrund von Slug-Änderung',
    creating: 'Erstelle...',
    revertSlug: 'Änderung verwerfen',
  },
}
