import { RedirectsCollectionConfig } from '@jhb.software/payload-pages-plugin'

export const Redirects: RedirectsCollectionConfig = {
  slug: 'redirects',
  admin: {
    defaultColumns: ['sourcePath', 'destinationPath', 'permanent', 'createdAt'],
  },
  redirects: {},
  fields: [
    // the fields are added by the plugin automatically
  ],
}
