import type { CollectionConfig } from 'payload'

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
    // The subset of the config's locales this tenant serves — read by `filterLocales`.
    {
      name: 'locales',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['en', 'de'],
      options: [
        { label: 'English', value: 'en' },
        { label: 'Deutsch', value: 'de' },
      ],
    },
  ],
}
