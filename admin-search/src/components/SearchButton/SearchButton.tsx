'use client'
import type React from 'react'

import { Button, SearchIcon, useHotkey, useTranslation } from '@payloadcms/ui'
import { Suspense, useState } from 'react'

import type {
  PluginAdminSearchTranslationKeys,
  PluginAdminSearchTranslations,
} from '../../translations/index.js'
import type { BaseFilterState } from '../../types/BaseFilterState.js'

import { getSearchShortcut } from '../../utils/getSearchShortcut.js'
import { SearchModal } from '../SearchModal/SearchModal.js'

export function SearchButton({
  baseFilterPromise,
}: {
  baseFilterPromise: Promise<BaseFilterState>
}): React.ReactElement {
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
        tooltip={t('@jhb.software/payload-admin-search:searchTooltip', {
          shortcut: getSearchShortcut(),
        })}
      >
        <SearchIcon />
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
