import type { Field } from 'payload'
import type { SlugFieldProps } from 'src/components/client/SlugFieldClient.js'
import type { Locale } from 'src/types/Locale.js'

import { beforeDuplicateSlug } from '../hooks/beforeDuplicate.js'
import { formatSlug } from '../hooks/validateSlug.js'
import { ROOT_PAGE_SLUG } from '../utils/setRootPageVirtualFields.js'
import { translatedLabel } from '../utils/translatedLabel.js'

type InternalSlugFieldConfig = {
  fallbackField: string
  pageSlug?: boolean
  staticValue?: Record<Locale, string> | string
  unique?: boolean
}

type PageSlugFieldConfig = Omit<InternalSlugFieldConfig, 'pageSlug'>
type SlugFieldConfig = Omit<InternalSlugFieldConfig, 'pageSlug'>

/**
 * The internal slug field which can be used on pages and non-page collections, depending on the `pageSlug` option.
 */
export function internalSlugField({
  fallbackField,
  pageSlug,
  staticValue,
  unique = true,
}: InternalSlugFieldConfig): Field {
  return {
    name: 'slug',
    type: 'text',
    admin: {
      components: {
        Field: {
          clientProps: {
            defaultValue: staticValue,
            fallbackField,
            pageSlug,
            readOnly: !!staticValue,
          } satisfies Omit<SlugFieldProps, 'redirectsCollectionSlug'>,
          path: '@jhb.software/payload-pages-plugin/server#SlugField',
        },
      },
      position: 'sidebar',
      readOnly: !!staticValue,
      // The condition option is not used to hide the field when the page is the root page because then the type of the slug field would be optional.
    },
    defaultValue: ({ locale }) =>
      typeof staticValue === 'string' ? staticValue : locale && staticValue?.[locale],
    hooks: {
      beforeDuplicate: [beforeDuplicateSlug],
    },
    index: true,
    label: translatedLabel('slug'),
    localized: true,
    required: true,
    unique,
    validate: (
      value: null | string | undefined,
      options: { data: any; id?: number | string; siblingData: any },
    ): string | true => {
      if (pageSlug && options.data.isRootPage) {
        return value === ROOT_PAGE_SLUG
          ? true
          : 'The slug of the root page must be an empty string.'
      } else {
        if (!value || value.trim().length === 0) {
          return 'The slug is required.'
        }

        if (value !== formatSlug(value)) {
          return 'The slug contains invalid characters.'
        }
      }

      return true
    },
  }
}

/** The slug field used by the plugin on all pages collections. */
export const pageSlugField = (config: PageSlugFieldConfig): Field => {
  return internalSlugField({ ...config, pageSlug: true })
}

/** A slug field which can be used on non-page collections. */
export const slugField = (config: SlugFieldConfig): Field => {
  return internalSlugField({ ...config, pageSlug: false })
}
