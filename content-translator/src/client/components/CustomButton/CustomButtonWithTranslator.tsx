'use client'

import './styles.scss'

import { PublishButton, SaveButton, useConfig, useDocumentInfo } from '@payloadcms/ui'

import type { TranslateResolver } from '../../../resolvers/types.js'

import { TranslatorProvider } from '../../providers/Translator/TranslatorProvider.js'
import { ResolverButton } from '../ResolverButton/ResolverButton.js'
import { TranslatorModal } from '../TranslatorModal/TranslatorModal.js'

export const CustomButtonWithTranslator = ({ type }: { type: 'publish' | 'save' }) => {
  const { config } = useConfig()

  const DefaultButton = type === 'publish' ? PublishButton : SaveButton

  const { id, globalSlug } = useDocumentInfo()

  const resolvers = (config.admin?.custom?.translator?.resolvers as TranslateResolver[]) ?? []

  if (!id && !globalSlug) {
    return <DefaultButton />
  }

  return (
    <TranslatorProvider>
      <div className={'translator__custom-save-button'}>
        {<DefaultButton />}
        <TranslatorModal />
        {resolvers.map((resolver) => (
          <ResolverButton key={resolver.key} resolver={resolver} />
        ))}
      </div>
    </TranslatorProvider>
  )
}
