'use client'
import type React from 'react'

import { Button, Pill, SearchIcon, useHotkey } from '@payloadcms/ui'
import { useState } from 'react'

import { getSearchShortcut } from '../../utils/getSearchShortcut.js'
import { usePluginTranslation } from '../../utils/usePluginTranslations.js'
import { SearchModal } from '../SearchModal/SearchModal.js'
import './SearchBar.css'

const baseClass = 'admin-search-plugin-bar'

export function SearchBar(): React.ReactElement {
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
        buttonStyle="none"
        className={`${baseClass} position-actions`}
        onClick={() => setIsModalOpen(true)}
      >
        <div className="admin-search-plugin-bar__wrap">
          <SearchIcon />
          <input
            aria-label={t('searchInput')}
            className="admin-search-plugin-bar__input"
            placeholder={t('searchPlaceholder')}
            type="text"
          />
          <Pill className="admin-search-plugin-bar__shortcut">{getSearchShortcut()}</Pill>
        </div>
      </Button>

      {isModalOpen && <SearchModal handleClose={() => setIsModalOpen(false)} />}
    </>
  )
}
