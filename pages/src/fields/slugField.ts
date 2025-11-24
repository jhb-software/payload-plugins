import { Field } from 'payload'
import { Locale } from 'src/types/Locale.js'
import { beforeDuplicateSlug } from '../hooks/beforeDuplicate.js'
import { formatSlug } from '../hooks/validateSlug.js'
import { SlugFieldProps } from 'src/components/client/SlugFieldClient.jsx'
import { ROOT_PAGE_SLUG } from '../utils/setRootPageVirtualFields.js'
import { translatedLabel } from '../utils/translatedLabel.js'

type InternalSlugFieldConfig = {
  pageSlug?: boolean
  fallbackField: string
  unique?: boolean
  staticValue?: string | Record<Locale, string>
}

type PageSlugFieldConfig = Omit<InternalSlugFieldConfig, 'pageSlug'>
type SlugFieldConfig = Omit<InternalSlugFieldConfig, 'pageSlug'>

/**
 * The internal slug field which can be used on pages and non-page collections, depending on the `pageSlug` option.
 */
export function internalSlugField({
  pageSlug,
  fallbackField,
  unique = true,
  staticValue,
}: InternalSlugFieldConfig): Field {
  return {
    name: 'slug',
    label: translatedLabel('slug'),
    type: 'text',
    defaultValue: ({ locale }) =>
      typeof staticValue === 'string' ? staticValue : locale && staticValue?.[locale],
    admin: {
      position: 'sidebar',
      readOnly: !!staticValue,
      components: {
        Field: {
          path: '@jhb.software/payload-pages-plugin/server#SlugField',
          clientProps: {
            readOnly: !!staticValue,
            defaultValue: staticValue,
            pageSlug: pageSlug,
            fallbackField: fallbackField,
          } satisfies Omit<SlugFieldProps, 'redirectsCollectionSlug'>,
        },
      },
      // The condition option is not used to hide the field when the page is the root page because then the type of the slug field would be optional.
    },
    validate: (
      value: string | null | undefined,
      options: { data: any; siblingData: any; id?: string | number },
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
    hooks: {
      beforeDuplicate: [beforeDuplicateSlug],
    },
    unique: unique,
    index: true,
    localized: true,
    required: true,
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
