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

/**
 * Access control for the translate endpoint. Receives the requesting `req`
 * together with the parsed request args (`update`, `collectionSlug`, `locale`,
 * …) so access can be decided per request.
 *
 * Security: every field other than `req`/`req.user` is attacker-controlled.
 * Grant access based on `req.user` and use the args only to further *restrict*
 * (e.g. require a role for `update: true`); never *widen* access based on a
 * value the caller supplied. Writes always run with `overrideAccess: false`, so
 * the collection's/global's own access control remains the authoritative gate.
 */
export type TranslateAccess = (
  args: { req: PayloadRequest } & TranslateEndpointArgs,
) => boolean | Promise<boolean>
