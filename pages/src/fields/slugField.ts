import type { Field, PayloadRequest, TextField } from 'payload'

import type { SlugFieldProps } from '../components/client/SlugFieldClient.js'
import type { Locale } from '../types/Locale.js'

import { beforeDuplicateSlug } from '../hooks/beforeDuplicate.js'
import { formatSlug } from '../hooks/validateSlug.js'
import { mergeFieldAdmin } from '../utils/fieldOverrides.js'
import { ROOT_PAGE_SLUG } from '../utils/setRootPageVirtualFields.js'
import { translatedLabel } from '../utils/translatedLabel.js'

type InternalSlugFieldConfig = {
  admin?: TextField['admin']
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
  admin,
  fallbackField,
  pageSlug,
  staticValue,
  unique = true,
}: InternalSlugFieldConfig): Field {
  return {
    name: 'slug',
    type: 'text',
    admin: mergeFieldAdmin<NonNullable<TextField['admin']>>(
      {
        components: {
          Field: {
            // `readOnly` is deliberately absent: Payload spreads these props last, so passing it
            // here would overwrite the read only state it derives for trashed and locked
            // documents. `SlugField` reads the static value instead.
            clientProps: {
              defaultValue: staticValue,
              fallbackField,
              pageSlug,
            } satisfies Omit<SlugFieldProps, 'readOnly' | 'redirectsCollectionSlug'>,
            path: '@jhb.software/payload-pages-plugin/server#SlugField',
          },
        },
        position: 'sidebar',
        // An explicit `false` would opt the field out of an inherited read only state, so the
        // key is only set when the static value actually makes the field read only.
        ...(staticValue ? { readOnly: true } : {}),
        // The condition option is not used to hide the field when the page is the root page because then the type of the slug field would be optional.
      },
      admin,
    ),
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
      options: {
        data: Record<string, unknown>
        id?: number | string
        req?: PayloadRequest
        siblingData: Record<string, unknown>
      },
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

        // A locale code as the first path segment is the locale prefix, so a page slugged like
        // one is unresolvable. The rule holds for every locale code regardless of routing and of
        // the document's depth, so re-parenting can never make a stored slug ambiguous.
        const localization = options.req?.payload?.config?.localization
        if (localization && localization.localeCodes.includes(value)) {
          // The plugin registers its own i18n namespace, which is not part of Payload's
          // generated translation-key union, so `t` is narrowed to a plain key lookup here.
          const t = options.req?.t as
            ((key: string, vars?: Record<string, unknown>) => string) | undefined

          return (
            t?.('@jhb.software/payload-pages-plugin:slugCannotBeALocaleCode', {
              slug: value,
            }) ??
            `The slug "${value}" is reserved: it is a locale code, which paths use as the locale prefix.`
          )
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
