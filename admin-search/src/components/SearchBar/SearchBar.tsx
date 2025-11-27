'use client'
import type React from 'react'

import { Button, Pill, SearchIcon, useHotkey } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { getSearchShortcut } from '../../utils/getSearchShortcut.js'
import { usePluginTranslation } from '../../utils/usePluginTranslations.js'
import { SearchModal } from '../SearchModal/SearchModal.js'
import './SearchBar.css'

const baseClass = 'admin-search-plugin-bar'

export function SearchBar(): React.ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [shortcut, setShortcut] = useState('')
  const { t } = usePluginTranslation()

  // Determine shortcut on client to avoid SSR hydration mismatch (navigator unavailable on server)
  useEffect(() => {
    setShortcut(getSearchShortcut())
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
        <div className="admin-search-plugin-bar__wrap">
          <SearchIcon />
          <span className="admin-search-plugin-bar__placeholder">{t('searchPlaceholder')}</span>
          <Pill className="admin-search-plugin-bar__shortcut">{shortcut || '⌘K'}</Pill>
        </div>
      </Button>
      {isModalOpen && <SearchModal handleClose={() => setIsModalOpen(false)} />}
    </>
  )
}
