'use client'
import type { CheckboxFieldClientProps } from '@payloadcms/ui/fields/Checkbox'

import { CheckboxField, useField } from '@payloadcms/ui'

import { HomeIcon } from '../../icons/HomeIcon.js'
import { usePluginTranslation } from '../../utils/usePluginTranslations.js'

/**
 * Field which displays either a checkbox to set the page to be root page or a message if the page is the root page.
 */
export const IsRootPageStatus: React.FC<
  { hasRootPage: boolean; readOnly?: boolean } & CheckboxFieldClientProps
> = ({ field, hasRootPage, path, readOnly }) => {
  const { value } = useField<boolean>({ path })
  const isRootPage = value ?? false
  const { t } = usePluginTranslation()

  if (isRootPage) {
    return (
      <div style={{ alignItems: 'center', display: 'flex', marginBottom: '3rem' }}>
        <div style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }}>
          <HomeIcon />
        </div>
        {t('rootPage')}
      </div>
    )
  } else if (!hasRootPage && !isRootPage) {
    return <CheckboxField field={field} path={path} readOnly={readOnly} />
  }

  return null
}
