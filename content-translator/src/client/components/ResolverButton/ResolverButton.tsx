import { Button } from '@payloadcms/ui'

import { useTranslator } from '../../providers/Translator/context.js'

export const ResolverButton = () => {
  const { openTranslator, resolver, translatorT } = useTranslator()

  if (!resolver) {
    return null
  }

  const handleClick = () => openTranslator()

  return (
    <Button buttonStyle="secondary" onClick={handleClick}>
      {translatorT('buttonLabel')}
    </Button>
  )
}
