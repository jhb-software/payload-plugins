'use client'

import type { ArrayFieldClientComponent } from 'payload'

import { ArrayField, Button, Drawer, useModal } from '@payloadcms/ui'

import { BreadcrumbsIcon } from '../../icons/BreadcrumbsIcon.js'
import { usePluginTranslation } from '../../utils/usePluginTranslations.js'

const breadcrumbsModalSlug = 'breadcrumbs-drawer'

export const BreadcrumbsFieldModalButton: React.FC = () => {
  const { toggleModal } = useModal()
  const { t } = usePluginTranslation()

  return (
    <Button
      buttonStyle="transparent"
      icon={<BreadcrumbsIcon />}
      onClick={() => toggleModal(breadcrumbsModalSlug)}
      size="small"
      tooltip={t('showBreadcrumbs')}
    />
  )
}
export const BreadcrumbsField: ArrayFieldClientComponent = (props) => {
  const { field, path } = props
  const { t } = usePluginTranslation()

  return (
    <div className="field-type breadcrumbs-field-component">
      <Drawer slug={breadcrumbsModalSlug} title={t('breadcrumbs')}>
        <div style={{ padding: '20px' }}>
          <ArrayField {...props} field={field} path={path} readOnly={true} />
        </div>
      </Drawer>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-base-100)' }} />
    </div>
  )
}

export default BreadcrumbsField
