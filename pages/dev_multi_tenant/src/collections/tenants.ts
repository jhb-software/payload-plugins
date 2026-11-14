import { CollectionConfig } from 'payload'

const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'websiteUrl',
      type: 'text',
      required: true,
    },
    {
      // Read by the plugin's `localeRouting` resolver: the locale this tenant's site leads with.
      name: 'primaryLocale',
      type: 'select',
      options: ['de', 'en'],
      defaultValue: 'en',
      required: true,
    },
    {
      // When false, the primary locale is served without its `/<locale>` prefix.
      name: 'prefixAllLocales',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
}

export default Tenants
