import type { GenericTranslationsObject } from './index.js'

export const fr: GenericTranslationsObject = {
  $schema: './translation-schema.json',
  '@jhb.software/payload-admin-search': {
    closeSearchModal: 'Fermer la fenêtre de recherche',
    errorSearching: 'Une erreur est survenue lors de la recherche. Veuillez réessayer.',
    escapeHint: 'ÉCHAP',
    noResultsFound: 'Aucun résultat pour « {{query}} »',
    noResultsHint: 'Essayez d’autres mots-clés ou vérifiez l’orthographe',
    openCollectionLabel: 'Ouvrir la collection {{label}}',
    openDocumentIn: 'Ouvrir {{title}} dans {{collection}}',
    openGlobalLabel: 'Ouvrir le global {{label}}',
    pillCollection: 'Collection',
    pillGlobal: 'Global',
    searchForDocuments: 'Rechercher des documents',
    searchInput: 'Champ de recherche',
    searchModalContent: 'Contenu de la fenêtre de recherche',
    searchPlaceholder: 'Rechercher',
    searchTooltip: 'Rechercher ({{shortcut}})',
    toClose: 'pour fermer',
    toNavigate: 'pour naviguer',
    toOpen: 'pour ouvrir',
    unknownCollection: 'Inconnue',
  },
}
