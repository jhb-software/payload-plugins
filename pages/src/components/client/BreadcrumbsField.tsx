'use client'

import type { ArrayFieldClientComponent } from 'payload'

import { ArrayField, Button, Drawer, useModal, useTranslation } from '@payloadcms/ui'

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
      buttonStyle="transparent"
      icon={<BreadcrumbsIcon />}
      onClick={() => toggleModal(breadcrumbsModalSlug)}
      size="small"
      tooltip={t('@jhb.software/payload-pages-plugin:showBreadcrumbs')}
    />
  )
}
export const BreadcrumbsField: ArrayFieldClientComponent = (props) => {
  const { field, path } = props
  const { t } = useTranslation<PluginPagesTranslations, PluginPagesTranslationKeys>()

  return (
    <div className="field-type breadcrumbs-field-component">
      <Drawer
        slug={breadcrumbsModalSlug}
        title={t('@jhb.software/payload-pages-plugin:breadcrumbs')}
      >
        <div style={{ padding: '20px' }}>
          <ArrayField {...props} field={field} path={path} readOnly={true} />
        </div>
      </Drawer>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-base-100)' }} />
    </div>
  )
}

export default BreadcrumbsField
