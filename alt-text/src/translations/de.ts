import type { GenericTranslationsObject } from './index.js'

export const de: GenericTranslationsObject = {
  $schema: './translation-schema.json',
  '@jhb.software/payload-alt-text-plugin': {
    // Field labels
    alternateText: 'Alternativtext',
    keywords: 'Schlüsselwörter',
    keywordsDescription:
      'Schlüsselwörter, die das Bild beschreiben. Wird bei der Suche nach dem Bild verwendet.',

    // Button labels
    generateAltText: 'Alternativtext generieren',
    generateAltTextFor: 'Alternativtext generieren für',
    image: 'Bild',
    images: 'Bilder',

    // Toast messages
    altTextGeneratedSuccess:
      'Alternativtext erfolgreich generiert. Bitte überprüfen und speichern Sie das Dokument.',
    cannotGenerateMissingFields:
      'Alternativtext kann nicht generiert werden. Erforderliche Felder fehlen.',
    errorGeneratingAltText:
      'Fehler beim Generieren des Alternativtextes. Bitte versuchen Sie es erneut.',
    failedToGenerate:
      'Generierung des Alternativtextes fehlgeschlagen. Bitte versuchen Sie es erneut.',
    failedToGenerateForXImages: 'Generierung des Alternativtextes für {X} Bilder fehlgeschlagen.',
    noAltTextGenerated: 'Kein Alternativtext generiert. Bitte versuchen Sie es erneut.',
    xOfYImagesUpdated: '{X} von {Y} Bildern aktualisiert.',

    // Help text
    altTextDescription:
      'Alternativtext für das Bild. Dieser wird für Screenreader und SEO verwendet. Er sollte die folgenden Anforderungen erfüllen:',
    altTextRequirement1: 'Beschreibt in 1-2 Sätzen, was auf dem Bild zu sehen ist.',
    altTextRequirement2:
      'Sollte möglichst die gleichen Informationen oder den gleichen Zweck wie das Bild vermitteln.',
    altTextRequirement3:
      'Phrasen wie "Bild von" oder "Foto von" sind überflüssig, da Screenreader bereits anzeigen, dass es sich um ein Bild handelt.',

    // Tooltips
    pleaseSaveDocumentFirst: 'Bitte speichern Sie zuerst das Dokument',

    // Validation messages
    theAlternateTextIsRequired: 'Der Alternativtext ist erforderlich.',
  },
}
