import type { PayloadRequest } from 'payload'

export type ValueToTranslate = {
  onTranslate: (translatedValue: any) => void
  value: any
}

/**
 * A deferred field transform collected during traversal and run once the whole
 * document has been translated (so it can read translated sibling values).
 */
export type AfterTranslateHook = {
  apply: (ctx: {
    data: Record<string, any>
    localeFrom: string
    localeTo: string
    req: PayloadRequest
  }) => Promise<void> | void
}

export type TranslateArgs = {
  collectionSlug?: string
  data?: Record<string, any>
  emptyOnly?: boolean
  globalSlug?: string
  id?: number | string
  /** active locale */
  locale: string
  localeFrom: string
  overrideAccess?: boolean
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

export type TranslateEndpointArgs = Omit<TranslateArgs, 'update'>
