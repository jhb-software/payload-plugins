export type ValueToTranslate = {
  onTranslate: (translatedValue: any) => void
  value: any
}

/**
 * - `all` — retranslate every field, discarding existing target content.
 * - `empty` — only fill fields that have no target value yet.
 * - `incremental` — for richText, translate only new or changed nodes and keep
 *   existing translations; other field types behave like `empty`.
 */
export type TranslateMode = 'all' | 'empty' | 'incremental'

/** Mutable accumulator threaded through traverseFields for incremental richText. */
export type IncrementalAccumulator = {
  /** Units left untouched because their source changed under a hand-edited translation. */
  conflictCount: number
  /** Deferred hash stamps, run after the translation values have been applied. */
  stamps: Array<() => void>
}

export type TranslateArgs = {
  collectionSlug?: string
  data?: Record<string, any>
  globalSlug?: string
  id?: number | string
  /** active locale */
  locale: string
  localeFrom: string
  mode?: TranslateMode
  overrideAccess?: boolean
  update?: boolean
}

export type TranslateResult =
  | {
      /** Number of richText paragraphs flagged for review (incremental mode). */
      reviewCount?: number
      success: true
      translatedData: Record<string, any>
    }
  | {
      success: false
    }

export type TranslateEndpointArgs = Omit<TranslateArgs, 'update'>
