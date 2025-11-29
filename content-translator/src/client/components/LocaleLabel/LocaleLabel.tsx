import { getTranslation } from '@payloadcms/translations'
import { ChevronIcon, useTranslation } from '@payloadcms/ui'
import type { Locale } from 'payload'
import { useTranslator } from '../../providers/Translator/context'

const baseClass = 'localizer-button'

export const LocaleLabel = ({ locale }: { locale: Locale }) => {
  const { i18n } = useTranslation()
  const { resolverT } = useTranslator()

  return (
    <div aria-label={resolverT('modalSourceLanguage')} className={baseClass}>
      <div className={`${baseClass}__label`}>{resolverT('modalSourceLanguage')}:</div>
      &nbsp;&nbsp;
      <span className={`${baseClass}__current-label`}>
        {`${getTranslation(locale.label, i18n)}`}
      </span>
      &nbsp;
      <ChevronIcon className={`${baseClass}__chevron`} />
    </div>
  )
}
