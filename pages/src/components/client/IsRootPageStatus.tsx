'use client'
import { CheckboxField, useField, useTranslation } from '@payloadcms/ui'
import { CheckboxFieldClientProps } from '@payloadcms/ui/fields/Checkbox'
import { HomeIcon } from '../../icons/HomeIcon.js'
import type {
  PluginPagesTranslations,
  PluginPagesTranslationKeys,
} from '../../translations/index.js'
/**
 * Field which displays either a checkbox to set the page to be root page or a message if the page is the root page.
 */
export const IsRootPageStatus: React.FC<
  CheckboxFieldClientProps & { hasRootPage: boolean; readOnly?: boolean }
> = ({ field, path, hasRootPage, readOnly }) => {
  const { value } = useField<boolean>({ path: path! })
  const isRootPage = value ?? false
  const { t } = useTranslation<PluginPagesTranslations, PluginPagesTranslationKeys>()

  if (isRootPage) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3rem' }}>
        <div style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }}>
          <HomeIcon />
        </div>
        {t('@jhb.software/payload-pages-plugin:rootPage')}
      </div>
    )
  } else if (!hasRootPage && !isRootPage) {
    return <CheckboxField path={path} field={field} readOnly={readOnly} />
  }

  return null
}
