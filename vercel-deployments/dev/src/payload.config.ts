import {
  vercelDeploymentsPlugin,
  type ResolveDeploymentTarget,
} from '@jhb.software/payload-vercel-deployments'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import { de } from '@payloadcms/translations/languages/de'
import { en } from '@payloadcms/translations/languages/en'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Posts } from './collections/posts'
import { Tenants } from './collections/tenants'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Resolves the Vercel project of the tenant selected in the admin panel. Switch tenants
 * in the selector and the dashboard widget reports that tenant's deployments. Without a
 * project the widget shows a hint instead and hides the deploy button.
 */
const selectedTenantTarget: ResolveDeploymentTarget = async ({ req }) => {
  const id = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)

  if (!id) {
    return { projectId: undefined }
  }

  const tenant = await req.payload.findByID({
    id,
    collection: 'tenants',
    // A stale cookie can point at a deleted tenant — treat that as no target.
    disableErrors: true,
    // Only the two fields the widget needs, no relationships.
    depth: 0,
    req,
    select: { vercelProjectId: true, websiteUrl: true },
  })

  return {
    projectId: tenant?.vercelProjectId ?? undefined,
    websiteUrl: tenant?.websiteUrl ?? undefined,
  }
}

export default buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
    dashboard: {
      defaultLayout: [{ widgetSlug: 'vercel-deployments', width: 'full' }],
    },
    meta: { titleSuffix: '- Vercel Deployments Dev' },
    user: 'users',
  },
  collections: [
    Posts,
    Tenants,
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
  ],
  db: mongooseAdapter({
    url: process.env.MONGODB_URL!,
  }),
  i18n: {
    supportedLanguages: { de, en },
  },
  localization: {
    defaultLocale: 'en',
    fallback: true,
    locales: ['en', 'de'],
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

    const existingTenants = await payload.find({ collection: 'tenants', limit: 1 })

    if (existingTenants.docs.length === 0) {
      await payload.create({
        collection: 'tenants',
        data: {
          name: 'Acme',
          vercelProjectId: process.env.VERCEL_PROJECT_ID,
          websiteUrl: 'https://www.example.com',
        },
      })

      // A tenant without a Vercel project: the widget shows a hint instead of
      // deployments and hides the deploy button.
      await payload.create({
        collection: 'tenants',
        data: { name: 'Not deployed yet' },
      })
    }
  },
  plugins: [
    vercelDeploymentsPlugin({
      deploymentTarget: selectedTenantTarget,
      vercel: {
        apiToken: process.env.VERCEL_API_TOKEN!,
        teamId: process.env.VERCEL_TEAM_ID,
      },
      widget: {
        maxWidth: 'full',
        minWidth: 'medium',
      },
    }),
    multiTenantPlugin({
      collections: { posts: {} },
      userHasAccessToAllTenants: () => true,
    }),
  ],
  secret: process.env.PAYLOAD_SECRET!,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
