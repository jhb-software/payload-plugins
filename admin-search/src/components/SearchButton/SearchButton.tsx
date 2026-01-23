'use client'
import type React from 'react'

import { Button, SearchIcon, useHotkey, useTranslation } from '@payloadcms/ui'
import { useState } from 'react'

import type {
  PluginAdminSearchTranslationKeys,
  PluginAdminSearchTranslations,
} from '../../translations/index.js'
import { getSearchShortcut } from '../../utils/getSearchShortcut.js'
import { SearchModal } from '../SearchModal/SearchModal.js'

export function SearchButton(): React.ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { t } = useTranslation<PluginAdminSearchTranslations, PluginAdminSearchTranslationKeys>()

  useHotkey(
    {
      cmdCtrlKey: true,
      editDepth: 1,
      keyCodes: ['k'],
    },
    (e) => {
      e.preventDefault()
      setIsModalOpen(true)
    },
  )

  return (
    <>
      <Button
        buttonStyle="icon-label"
        onClick={() => setIsModalOpen(true)}
        size="small"
        tooltip={t('@jhb.software/payload-admin-search:searchTooltip').replace(
          '{shortcut}',
          getSearchShortcut(),
        )}
      >
        <SearchIcon />
      </Button>

      {isModalOpen && <SearchModal handleClose={() => setIsModalOpen(false)} />}
    </>
  )
}
