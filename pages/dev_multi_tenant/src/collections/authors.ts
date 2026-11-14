import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

export const Authors: PageCollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
  },
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
      sharedDocument: true,
    },
    breadcrumbs: {
      labelField: 'name',
    },
    slug: {
      // Disable the slug uniqueness because of the multi-tenant setup. A compound
      // ['slug', 'tenant'] index is not an option here: the SQL adapters reject a compound index
      // mixing the localized `slug` with the unlocalized `tenant`.
      unique: false,
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
  ],
}
