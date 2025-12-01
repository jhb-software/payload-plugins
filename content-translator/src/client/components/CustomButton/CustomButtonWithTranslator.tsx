'use client'

import './styles.scss'

import { PublishButton, SaveButton, useConfig, useDocumentInfo } from '@payloadcms/ui'

import type { TranslatorClientConfig } from '../../../types.js'

import { TranslatorProvider } from '../../providers/Translator/TranslatorProvider.js'
import { ResolverButton } from '../ResolverButton/ResolverButton.js'
import { TranslatorModal } from '../TranslatorModal/TranslatorModal.js'

export const CustomButtonWithTranslator = ({ type }: { type: 'publish' | 'save' }) => {
  const { config } = useConfig()

  const DefaultButton = type === 'publish' ? PublishButton : SaveButton

  const { id, globalSlug } = useDocumentInfo()

  const resolver =
    (config.admin?.custom as TranslatorClientConfig | undefined)?.translator?.resolver ?? null

  if (!id && !globalSlug) {
    return <DefaultButton />
  }

  return (
    <TranslatorProvider>
      <div className={'translator__custom-save-button'}>
        {<DefaultButton />}
        <TranslatorModal />
        {resolver && <ResolverButton />}
      </div>
    </TranslatorProvider>
  )
}
