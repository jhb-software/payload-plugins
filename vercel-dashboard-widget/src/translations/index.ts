import { de } from './de.js'
import { en } from './en.js'

// copied from https://github.com/payloadcms/payload/blob/main/packages/translations/src/types.ts
export type GenericTranslationsObject = {
  [key: string]: GenericTranslationsObject | string
}

// copied from https://github.com/payloadcms/payload/blob/main/packages/translations/src/types.ts
export type NestedKeysStripped<T> = T extends object
  ? {
      [K in keyof T]-?: K extends string
        ? T[K] extends object
          ? `${K}:${NestedKeysStripped<T[K]>}`
          : `${StripCountVariants<K>}`
        : never
    }[keyof T]
  : ''

// copied from https://github.com/payloadcms/payload/blob/main/packages/translations/src/types.ts
export type StripCountVariants<TKey> = TKey extends
  | `${infer Base}_many`
  | `${infer Base}_one`
  | `${infer Base}_other`
  ? Base
  : TKey

export const translations = {
  de,
  en,
}

export type VercelDashboardTranslations = GenericTranslationsObject

export type VercelDashboardTranslationKeys = NestedKeysStripped<VercelDashboardTranslations>
