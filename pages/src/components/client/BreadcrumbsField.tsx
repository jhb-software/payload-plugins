'use client'

import { ArrayField, Drawer, Button, useModal, useTranslation } from '@payloadcms/ui'
import { ArrayFieldClientComponent } from 'payload'
import { BreadcrumbsIcon } from '../../icons/BreadcrumbsIcon.js'
import type {
  PluginPagesTranslations,
  PluginPagesTranslationKeys,
} from '../../translations/index.js'

const breadcrumbsModalSlug = 'breadcrumbs-drawer'

export const BreadcrumbsFieldModalButton: React.FC = () => {
  const { toggleModal } = useModal()
  const { t } = useTranslation<PluginPagesTranslations, PluginPagesTranslationKeys>()

  return (
    <Button
      onClick={() => toggleModal(breadcrumbsModalSlug)}
      buttonStyle="transparent"
      size="small"
      tooltip={t('@jhb.software/payload-pages-plugin:showBreadcrumbs')}
      icon={<BreadcrumbsIcon />}
    />
  )
}
export const BreadcrumbsField: ArrayFieldClientComponent = (props) => {
  const { field, path } = props
  const { t } = useTranslation<PluginPagesTranslations, PluginPagesTranslationKeys>()

  return (
    <div className="field-type breadcrumbs-field-component">
      <Drawer slug={breadcrumbsModalSlug} title={t('@jhb.software/payload-pages-plugin:breadcrumbs')}>
        <div style={{ padding: '20px' }}>
          <ArrayField {...props} field={field} path={path} readOnly={true} />
        </div>
      </Drawer>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-base-100)' }} />
    </div>
  )
}

export default BreadcrumbsField
