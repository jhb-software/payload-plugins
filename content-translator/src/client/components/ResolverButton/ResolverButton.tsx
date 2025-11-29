import { Button, useTranslation } from '@payloadcms/ui'

import type { TranslateResolver } from '../../../resolvers/types.js'

import { useTranslator } from '../../providers/Translator/context.js'

export const ResolverButton = ({
  resolver: { key: resolverKey },
}: {
  resolver: TranslateResolver
}) => {
  const { openTranslator } = useTranslator()

  const { t } = useTranslation()

  const handleClick = () => openTranslator({ resolverKey })

  return (
    <Button buttonStyle="secondary" onClick={handleClick}>
      {t(`plugin-translator:resolver_${resolverKey}_buttonLabel` as Parameters<typeof t>[0])}
    </Button>
  )
}
