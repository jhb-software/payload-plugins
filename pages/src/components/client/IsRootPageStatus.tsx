'use client'

import type { CheckboxFieldClientProps } from '@payloadcms/ui/fields/Checkbox'

import { CheckboxField, useField, useTranslation } from '@payloadcms/ui'

import type {
  PluginPagesTranslationKeys,
  PluginPagesTranslations,
} from '../../translations/index.js'

import { HomeIcon } from '../../icons/HomeIcon.js'

/**
 * Field which displays either a checkbox to set the page to be root page or a message if the page is the root page.
 */
export const IsRootPageStatus: React.FC<
  { hasRootPage: boolean; readOnly?: boolean } & CheckboxFieldClientProps
> = ({ field, hasRootPage, path, readOnly }) => {
  const { value } = useField<boolean>({ path })
  const isRootPage = value ?? false
  const { t } = useTranslation<PluginPagesTranslations, PluginPagesTranslationKeys>()

  if (isRootPage) {
    return (
      <div style={{ alignItems: 'center', display: 'flex', marginBottom: '3rem' }}>
        <div style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }}>
          <HomeIcon />
        </div>
        {t('@jhb.software/payload-pages-plugin:rootPage')}
      </div>
    )
  } else if (!hasRootPage && !isRootPage) {
    return <CheckboxField field={field} path={path} readOnly={readOnly} />
  }

  return null
}
