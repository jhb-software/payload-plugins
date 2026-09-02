import type { CollectionConfig } from 'payload'

/**
 * Each tenant deploys to its own Vercel project. The plugin reads `vercelProjectId` and
 * `websiteUrl` of the tenant selected in the admin panel.
 */
export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'vercelProjectId',
      type: 'text',
      admin: {
        description: 'Vercel project this tenant deploys to, e.g. prj_abc123.',
      },
    },
    {
      name: 'websiteUrl',
      type: 'text',
    },
  ],
}
