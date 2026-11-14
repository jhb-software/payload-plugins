import type { CollectionConfig } from 'payload'

// Folder-enabled upload collection used to verify that moving a document
// between folders does not trigger alt-text validation when `alt` is absent
// from the request body. Combined with the dev app's `localization.fallback:
// false`, leaving alt text empty in one locale used to block folder moves;
// this collection lets a reviewer click through that scenario end-to-end.

export const MediaWithFolders: CollectionConfig = {
  slug: 'media-with-folders',
  labels: {
    plural: { de: 'Medien mit Ordnern', en: 'Media with Folders' },
    singular: { de: 'Medium mit Ordner', en: 'Media with Folder' },
  },
  folders: true,
  upload: {
    mimeTypes: ['image/*'],
  },
  fields: [
    {
      name: 'url',
      type: 'text',
      admin: {
        hidden: true,
      },
      hooks: {
        afterRead: [
          async () => 'https://images.pexels.com/photos/16981245/pexels-photo-16981245.jpeg',
        ],
      },
    },
  ],
}
