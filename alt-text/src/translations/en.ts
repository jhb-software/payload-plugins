import type { GenericTranslationsObject } from './index.js'

export const en: GenericTranslationsObject = {
  $schema: './translation-schema.json',
  '@jhb.software/payload-alt-text-plugin': {
    // Field labels
    alternateText: 'Alternate text',
    keywords: 'Keywords',
    keywordsDescription: 'Keywords which describe the image. Used when searching for the image.',

    // Button labels
    generateAltText: 'Generate alt text',
    generateAltTextFor: 'Generate alt text for',
    image: 'image',
    images: 'images',

    // Toast messages
    altTextGeneratedSuccess:
      'Alt text generated successfully. Please review and save the document.',
    cannotGenerateMissingFields: 'Cannot generate alt text. Missing required fields.',
    errorGeneratingAltText: 'Error generating alt text. Please try again.',
    failedToGenerate: 'Failed to generate alt text. Please try again.',
    failedToGenerateForXImages: 'Failed to generate alt text for {X} images.',
    noAltTextGenerated: 'No alt text generated. Please try again.',
    xOfYImagesUpdated: '{X} of {Y} images updated.',

    // Help text
    altTextDescription:
      'Alternate text for the image. This will be used for screen readers and SEO. It should meet the following requirements:',
    altTextRequirement1: 'Describes in 1-2 sentences, what is visible in the image.',
    altTextRequirement2:
      'Should convey the same information or purpose as the image, whenever possible.',
    altTextRequirement3:
      'Phrases like "image of" or "picture of" are unnecessary, since screen readers already announce that it\'s an image.',

    // Tooltips
    pleaseSaveDocumentFirst: 'Please save the document first',

    // Validation messages
    theAlternateTextIsRequired: 'An alternate text is required.',
  },
}
