import type { CollectionSlug, Field, GlobalSlug, PayloadRequest } from 'payload'

import type { TranslateResolver } from './resolvers/types.js'

/**
 * The key under a field's `custom` object that holds per-field translator
 * configuration. Named after the plugin scope so it never collides with other
 * plugins' `custom` data.
 */
export const CONTENT_TRANSLATOR_FIELD_KEY = 'content-translator' as const

export type BeforeTranslateArgs = {
  localeFrom: string
  localeTo: string
  req: PayloadRequest
  /** Source-locale sibling fields in the same object. */
  siblingData: Record<string, unknown>
  /** Source-locale value of the field (the string about to be sent). */
  value: string
}

export type AfterTranslateArgs = {
  /** The full translated document (target locale). */
  data: Record<string, unknown>
  localeFrom: string
  localeTo: string
  req: PayloadRequest
  /** Already-translated sibling fields in the same object (target locale). */
  siblingData: Record<string, unknown>
  /** Source-locale value of the field. */
  sourceValue: unknown
  /**
   * This field's value after translation: the translated value when the field
   * was translated, or the source value when it was skipped.
   */
  value: unknown
}

/**
 * Per-field translator configuration, set on a field via
 * `custom: { 'content-translator': { ... } }`.
 *
 * These hooks are field-local and provider-agnostic: a field declares how it
 * should be handled regardless of its name or type, so derived fields like
 * slugs work the same whatever they're called.
 */
export type ContentTranslatorFieldConfig = {
  /**
   * Post-process this field once the rest of the document has been translated.
   * Receives the field's own (already-translated) `value` plus the translated
   * `siblingData` and `data`; return the final value. Runs independently of
   * `skip`, and may be async. Two common shapes:
   *
   * - Derive from a sibling, skipping translation: pair with `skip: true` and
   *   read `siblingData` (e.g. re-slugify the already-translated title).
   * - Translate, then normalize: leave `skip` unset so the field is translated,
   *   then clean up the translated `value` (e.g. slugify a free-form slug).
   */
  afterTranslate?: (args: AfterTranslateArgs) => unknown
  /**
   * Transform the source value just before it is sent to the resolver (e.g.
   * strip a template prefix). The resolver translates the returned string and
   * the result is written back as usual. Not called when the field is skipped,
   * since nothing is sent.
   */
  beforeTranslate?: (args: BeforeTranslateArgs) => string
  /**
   * Exclude this field from the resolver — its value is not translated. Combine
   * with `afterTranslate` to derive the value from other fields, or use alone to
   * let the app or a Payload hook own the field.
   */
  skip?: boolean
}

/** Read the translator config from a field's `custom`. */
export const getFieldTranslatorConfig = (
  field: Field,
): ContentTranslatorFieldConfig | undefined => {
  const custom = field.custom as Record<string, unknown> | undefined

  if (!custom || typeof custom !== 'object') {
    return undefined
  }

  return custom[CONTENT_TRANSLATOR_FIELD_KEY] as ContentTranslatorFieldConfig | undefined
}

declare module 'payload' {
  interface FieldCustom {
    'content-translator'?: ContentTranslatorFieldConfig
  }
}

export type TranslatorConfig = {
  /**
   * Custom access control for the translate endpoint.
   * Return `true` to allow access, `false` to deny.
   *
   * @default ({ req }) => !!req.user — requires authentication
   */
  access?: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /**
   * Collections with the enabled translator in the admin UI
   */
  collections: CollectionSlug[]
  /**
   * Enable the plugin.
   * @default true
   */
  enabled?: boolean
  /**
   * Globals with the enabled translator in the admin UI
   */
  globals: GlobalSlug[]
  /**
   * The translation resolver/service to use (e.g., openAIResolver)
   */
  resolver: TranslateResolver
}

/**
 * Shape of translator custom config stored on admin.custom and config.custom
 */
export type TranslatorCustomConfig = {
  translator?: {
    resolver: TranslateResolver
  }
}

/**
 * Client-safe shape of translator config (only includes key)
 */
export type TranslatorClientConfig = {
  translator?: {
    resolver: { key: string }
  }
}
