'use client'
import type React from 'react'

import { Button, SearchIcon, useHotkey } from '@payloadcms/ui'
import { useState } from 'react'

import { getSearchShortcut } from '../../utils/getSearchShortcut.js'
import { usePluginTranslation } from '../../utils/usePluginTranslations.js'
import { SearchModal } from '../SearchModal/SearchModal.js'

export function SearchButton(): React.ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { t } = usePluginTranslation()

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
        tooltip={t('searchTooltip').replace('{shortcut}', getSearchShortcut())}
      >
        <SearchIcon />
      </Button>

      {isModalOpen && <SearchModal handleClose={() => setIsModalOpen(false)} />}
    </>
  )
}
