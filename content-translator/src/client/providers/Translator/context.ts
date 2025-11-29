import type { Locale } from 'payload'

import { createContext, useContext } from 'react'

import type { TranslateResolver } from '../../../resolvers/types.js'

type TranslatorContextData = {
  closeTranslator: () => void
  localesOptions: Locale[]
  localeToTranslateFrom: string
  modalSlug: string
  openTranslator: (args: { resolverKey: string }) => void
  resolver: null | TranslateResolver
  resolverT: (
    key:
      | 'buttonLabel'
      | 'errorMessage'
      | 'modalDescription'
      | 'modalSourceLanguage'
      | 'modalTitle'
      | 'modalTranslating'
      | 'submitButtonLabelEmpty'
      | 'submitButtonLabelFull'
      | 'successMessage',
  ) => string
  setLocaleToTranslateFrom: (code: string) => void
  submit: (args: { emptyOnly: boolean }) => Promise<void>
}

export const TranslatorContext = createContext<null | TranslatorContextData>(null)

export const useTranslator = () => {
  const context = useContext(TranslatorContext)

  if (context === null) {
    throw new Error('useTranslator must be used within TranslatorProvider')
  }

  return context
}
