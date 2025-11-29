import type { Locale } from 'payload'

import { createContext, useContext } from 'react'

export type TranslationKey =
  | 'buttonLabel'
  | 'errorMessage'
  | 'modalDescription'
  | 'modalSourceLanguage'
  | 'modalTitle'
  | 'modalTranslating'
  | 'submitButtonLabelEmpty'
  | 'submitButtonLabelFull'
  | 'successMessage'

type TranslatorContextData = {
  closeTranslator: () => void
  localesOptions: Locale[]
  localeToTranslateFrom: string
  modalSlug: string
  openTranslator: () => void
  resolver: { key: string } | null
  setLocaleToTranslateFrom: (code: string) => void
  submit: (args: { emptyOnly: boolean }) => Promise<void>
  translatorT: (key: TranslationKey) => string
}

export const TranslatorContext = createContext<null | TranslatorContextData>(null)

export const useTranslator = () => {
  const context = useContext(TranslatorContext)

  if (context === null) {
    throw new Error('useTranslator must be used within TranslatorProvider')
  }

  return context
}
