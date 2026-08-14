import type {
  ArrayField,
  CheckboxField,
  CollectionSlug,
  FilterOptions,
  RelationshipField,
  TextField,
} from 'payload'

import type { Locale } from './Locale.js'

/** The incoming attributes for the page collection config. */
export type IncomingPageCollectionConfigAttributes = {
  breadcrumbs?: {
    /**
     * Overrides for the `admin` config of the generated breadcrumbs field, deep
     * merged over the plugin's own.
     */
    admin?: ArrayField['admin']

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

  isRootPage?: {
    /**
     * Overrides for the `admin` config of the generated isRootPage field, deep
     * merged over the plugin's own. Only applies when `isRootCollection` is `true`,
     * because the field is only generated for the root collection.
     */
    admin?: CheckboxField['admin']
  }

  /** Whether Payloads live preview feature should be enabled for this collection. Defaults to `true`. */
  livePreview?: boolean

  parent: {
    /**
     * Overrides for the `admin` config of the generated parent field, deep merged
     * over the plugin's own. `condition` is ANDed with the plugin's (which hides
     * the field on the root page) rather than replacing it, so an override can
     * only hide the field in more cases, never reveal it in fewer.
     */
    admin?: RelationshipField['admin']

    /**
     * Collection(s) in which the parent document may be stored.
     *
     * A single slug keeps the field monomorphic: the value is a bare id, exactly as before.
     * A list makes it polymorphic, storing `{ relationTo, value }` — which lets a collection
     * nest under itself and under other page collections at the same time.
     *
     * Payload treats even a single-element list as polymorphic, so declaring `['pages']` up
     * front adopts the polymorphic storage layout now and adding further slugs later never
     * requires a second migration. Switching an existing collection from a slug to a list is
     * a storage change; see the migration section of the README.
     */
    collection: CollectionSlug | CollectionSlug[]

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
    /**
     * Overrides for the `admin` config of the generated path field, deep merged
     * over the plugin's own. Note that `PathField` renders neither `description`
     * nor `readOnly`; to change how the field looks, replace `components.Field`.
     */
    admin?: TextField['admin']
  }

  /** Whether Payloads feature should be enabled for this collection. Defaults to `true`. */
  preview?: boolean

  slug?: {
    /**
     * Overrides for the `admin` config of the generated slug field, deep merged
     * over the plugin's own. Note that `SlugField` renders neither `description`
     * nor `readOnly` (which follows `staticValue`); to change how the field looks,
     * replace `components.Field`.
     */
    admin?: TextField['admin']

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
    /**
     * Collection(s) in which the parent document may be stored. A list makes the field
     * polymorphic; read it through `utils/parentRef.ts` rather than branching on the shape.
     */
    collection: CollectionSlug | CollectionSlug[]

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
