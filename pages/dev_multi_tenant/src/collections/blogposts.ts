import { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

export const Blogposts: PageCollectionConfig = {
  slug: 'blogposts',
  admin: {
    useAsTitle: 'title',
  },
  page: {
    parent: {
      collection: 'authors',
      name: 'author',
      sharedDocument: false,
    },
    breadcrumbs: {
      labelField: 'shortTitle',
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
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'shortTitle',
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
