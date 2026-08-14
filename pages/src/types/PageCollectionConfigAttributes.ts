import type {
  ArrayField,
  CollectionSlug,
  FilterOptions,
  SingleRelationshipField,
  TextField,
} from 'payload'

import type { Locale } from './Locale.js'

/**
 * Overrides for the `admin` config of a generated field, deep merged over the
 * plugin's own — `components.Field` can be replaced without losing
 * `position: 'sidebar'`. `condition` is ANDed rather than replaced, so an
 * override can only hide the field in more cases, never in fewer.
 */
type FieldAdminOverride<TField extends { admin?: unknown }> = TField['admin']

/** The incoming attributes for the page collection config. */
export type IncomingPageCollectionConfigAttributes = {
  breadcrumbs?: {
    /** Admin overrides for the generated breadcrumbs field. */
    admin?: FieldAdminOverride<ArrayField>

    /**
     * Name of the field to use to generate the breadcrumb label.
     * Most of the time this will be the field which is set as the 'useAsTitle' field.
     *
     * Defaults to `admin.useAsTitle`.
     **/
    labelField?: string
  }

  /** Whether this collection contains the root page and therefore the parent field is optional. Defaults to `false`. */
  isRootCollection?: boolean

  /** Whether Payloads live preview feature should be enabled for this collection. Defaults to `true`. */
  livePreview?: boolean

  parent: {
    /** Admin overrides for the generated parent field. */
    admin?: FieldAdminOverride<SingleRelationshipField>

    /** Collection in which the parent document is stored. */
    collection: CollectionSlug

    /**
     * Additional filter for the parent picker, ANDed with the plugin's own
     * (which excludes the current document from its own parents). Payload
     * re-runs `filterOptions` on save, so this also holds REST/local API writes.
     */
    filterOptions?: FilterOptions

    /** Name of the field which stores the parent document. */
    name: string

    /** Whether all documents share the same parent document. Defaults to `false`. */
    sharedDocument?: boolean
  }

  path?: {
    /** Admin overrides for the generated path field. */
    admin?: FieldAdminOverride<TextField>
  }

  /** Whether Payloads feature should be enabled for this collection. Defaults to `true`. */
  preview?: boolean

  slug?: {
    /** Admin overrides for the generated slug field. */
    admin?: FieldAdminOverride<TextField>

    /** Name of the field to use as fallback for the slug field. Defaults to the `useAsTitle` field. */
    fallbackField?: string

    /** Defines a static slug value for all documents in the collection. This will make the slug field readonly. */
    staticValue?: Record<Locale, string> | string

    /** Whether the slug must be unique. Defaults to `true`. */
    unique?: boolean
  }
}

/** The attributes for the page collection config after they have been processed using the incoming config attributes. */
export type PageCollectionConfigAttributes = {
  breadcrumbs: {
    /** Name of the field to use to generate the breadcrumb label. */
    labelField: string
  }

  /** Whether this collection contains the root page and therefore the parent field is optional. */
  isRootCollection: boolean

  /** Whether Payloads live preview feature should be enabled for this collection. */
  livePreview: boolean

  parent: {
    /** Collection in which the parent document is stored. */
    collection: CollectionSlug

    /** Name of the field which stores the parent document. */
    name: string

    /** Whether all documents share the same parent document. */
    sharedDocument: boolean
  }

  /** Whether Payloads feature should be enabled for this collection. */
  preview: boolean

  slug: {
    /** Name of the field to use as fallback for the slug field. */
    fallbackField: string

    /** The static slug value for all documents in the collection. */
    staticValue?: Record<Locale, string> | string

    /** Whether the slug must be unique.  */
    unique: boolean
  }
}
