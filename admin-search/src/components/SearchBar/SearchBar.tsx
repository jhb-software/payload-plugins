'use client'
import type React from 'react'

import { Button, Pill, SearchIcon, useHotkey, useTranslation } from '@payloadcms/ui'
import { Suspense, useEffect, useState } from 'react'

import type {
  PluginAdminSearchTranslationKeys,
  PluginAdminSearchTranslations,
} from '../../translations/index.js'
import type { BaseFilterState } from '../../types/BaseFilterState.js'

import { getSearchShortcut } from '../../utils/getSearchShortcut.js'
import { SearchModal } from '../SearchModal/SearchModal.js'
import './SearchBar.css'

const baseClass = 'admin-search-plugin-bar'

export function SearchBar({
  baseFilterPromise,
}: {
  baseFilterPromise: Promise<BaseFilterState>
}): React.ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [shortcut, setShortcut] = useState('')
  const { t } = useTranslation<PluginAdminSearchTranslations, PluginAdminSearchTranslationKeys>()

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
          <span className="admin-search-plugin-bar__placeholder">
            {t('@jhb.software/payload-admin-search:searchPlaceholder')}
          </span>
          <Pill className="admin-search-plugin-bar__shortcut">{shortcut || '⌘K'}</Pill>
        </div>
      </Button>
      {isModalOpen && (
        // The modal is the first thing that needs the filter, so the wait for it — if any
        // is left by the time the modal opens — happens here rather than in the header.
        <Suspense fallback={null}>
          <SearchModal
            baseFilterPromise={baseFilterPromise}
            handleClose={() => setIsModalOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
