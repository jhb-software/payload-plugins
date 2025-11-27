'use client'
import type React from 'react'

import { Button, Pill, SearchIcon, useHotkey } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { SearchModal } from '../SearchModal/SearchModal.js'
import './SearchBar.css'

const baseClass = 'admin-search-plugin-bar'

export function SearchBar(): React.ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [shortcutKey, setShortcutKey] = useState('Ctrl')

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
        <div className="admin-search-plugin-bar__wrap">
          <SearchIcon />
          <input
            aria-label="Search input"
            className="admin-search-plugin-bar__input"
            placeholder="Search..."
            type="text"
          />
          <Pill className="admin-search-plugin-bar__shortcut">{shortcutKey} + K</Pill>
        </div>
      </Button>

      {isModalOpen && <SearchModal handleClose={() => setIsModalOpen(false)} />}
    </>
  )
}