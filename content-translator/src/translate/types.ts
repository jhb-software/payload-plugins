export type ValueToTranslate = {
  onTranslate: (translatedValue: any) => void
  value: any
}

export type TranslateArgs = {
  collectionSlug?: string
  data?: Record<string, any>
  /**
   * When `update` is true, persist the translation as a draft version instead
   * of writing to the published document.
   * @default false
   */
  draft?: boolean
  emptyOnly?: boolean
  globalSlug?: string
  id?: number | string
  /** active locale */
  locale: string
  localeFrom: string
  overrideAccess?: boolean
  /**
   * Persist the translation to the target locale instead of only returning it.
   * @default false
   */
  update?: boolean
}

export type TranslateResult =
  | {
      success: false
    }
  | {
      success: true
      translatedData: Record<string, any>
    }

/**
 * Request body accepted by the translate endpoint. `overrideAccess` is omitted
 * so callers can never bypass the requesting user's collection/global access —
 * the endpoint always reads and writes with `overrideAccess: false`.
 */
export type TranslateEndpointArgs = Omit<TranslateArgs, 'overrideAccess'>
