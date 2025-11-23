'use client'
import type React from 'react'

import { Button, Pill, SearchIcon, useHotkey } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { usePluginTranslation } from '../../utils/usePluginTranslations.js'
import { SearchModal } from '../SearchModal/SearchModal.js'
import './SearchBar.css'

const baseClass = 'search-bar'

export function SearchBar(): React.ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [shortcutKey, setShortcutKey] = useState('Ctrl')
  const { t } = usePluginTranslation()

  useEffect(() => {
    const isMac = typeof window !== 'undefined' && /Mac/i.test(navigator.platform)
    setShortcutKey(isMac ? '⌘' : 'Ctrl')
  }, [])

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
        <div className="search-bar__wrap">
          <SearchIcon />
          <input
            aria-label={t('searchInput')}
            className="search-filter__input"
            placeholder={t('searchPlaceholder')}
            type="text"
          />
          <Pill className="shortcut-key">{shortcutKey} + K</Pill>
        </div>
      </Button>

      {isModalOpen && <SearchModal handleClose={() => setIsModalOpen(false)} />}
    </>
  )
}