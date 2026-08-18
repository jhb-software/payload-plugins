import { adminSearchPlugin } from '@jhb.software/payload-admin-search'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import { searchPlugin } from '@payloadcms/plugin-search'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { de } from 'payload/i18n/de'
import { en } from 'payload/i18n/en'
import { fileURLToPath } from 'url'

import { authorsSchema } from './collections/authors'
import { mediaSchema } from './collections/media'
import { pagesSchema } from './collections/pages'
import { postsSchema } from './collections/posts'
import { tenantsSchema } from './collections/tenants'
import { seed } from './seed'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
    meta: { titleSuffix: '- Admin Search Dev' },
    user: 'users',
  },
  collections: [
    pagesSchema,
    postsSchema,
    authorsSchema,
    mediaSchema,
    tenantsSchema,
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
  ],
  db: mongooseAdapter({
    url: process.env.DATABASE_URI!,
  }),

  editor: lexicalEditor(),

  i18n: {
    supportedLanguages: { de, en },
  },

  secret: process.env.PAYLOAD_SECRET || 'secret',

  typescript: {
    outputFile: path.resolve(__dirname, '../payload-types.ts'),
  },

  async onInit(payload) {
    const existingUsers = await payload.find({
      collection: 'users',
      limit: 1,
    })

    if (existingUsers.docs.length === 0) {
      await payload.create({
        collection: 'users',
        data: {
          email: 'dev@payloadcms.com',
          password: 'test',
        },
      })
    }

    await seed(payload)
  },

  plugins: [
    adminSearchPlugin({
      // Restricts search results to the tenant selected in the admin panel. Switch tenants
      // in the selector and the same query returns that tenant's documents only; with no
      // tenant selected the search stays unscoped, matching what the tenant selector shows.
      baseFilter: ({ req }) => {
        const tenant = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)

        return tenant ? { tenant: { equals: tenant } } : {}
      },
      headerSearchComponentStyle: 'bar',
    }),
    multiTenantPlugin({
      collections: { pages: {}, posts: {} },
      userHasAccessToAllTenants: () => true,
    }),
    searchPlugin({
      // The `search` collection defaults to public read (`read: () => true`). This dev
      // app restricts it to authenticated users; set access to match your app's needs.
      searchOverrides: {
        access: {
          read: ({ req }) => Boolean(req.user),
        },
        // The base filter constrains `tenant`, so the search collection has to carry it.
        fields: ({ defaultFields }) => [
          ...defaultFields,
          { name: 'tenant', type: 'relationship', index: true, relationTo: 'tenants' },
        ],
      },
      beforeSync: ({ originalDoc, searchDoc }) => {
        return {
          ...searchDoc,
          tenant: originalDoc.tenant ?? null,
          title:
            searchDoc.doc.relationTo === 'authors'
              ? originalDoc.name
              : searchDoc.doc.relationTo === 'media'
                ? originalDoc.filename
                : originalDoc.title,
        }
      },
      collections: ['pages', 'posts', 'authors', 'media'],
    }),
  ],
})
