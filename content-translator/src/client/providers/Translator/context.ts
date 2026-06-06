import type { Locale } from 'payload'

import { createContext, useContext } from 'react'

import type { TranslateMode } from '../../../translate/types.js'

export type TranslationKey =
  | 'buttonLabel'
  | 'errorMessage'
  | 'modalDescription'
  | 'modalSourceLanguage'
  | 'modalTitle'
  | 'modalTranslating'
  | 'reviewNeeded'
  | 'submitButtonLabelEmpty'
  | 'submitButtonLabelFull'
  | 'submitButtonLabelIncremental'
  | 'successMessage'

type TranslatorContextData = {
  closeTranslator: () => void
  localesOptions: Locale[]
  localeToTranslateFrom: string
  modalSlug: string
  openTranslator: () => void
  resolver: { key: string } | null
  setLocaleToTranslateFrom: (code: string) => void
  submit: (args: { mode: TranslateMode }) => Promise<void>
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
