'use client'

import { useTranslation } from '@payloadcms/ui'

import type {
  VercelDashboardTranslationKeys,
  VercelDashboardTranslations,
} from '../translations/index.js'

/**
 * Custom hook which provides type-safe access to dashboard-specific translations.
 */
export function useDashboardTranslation() {
  return useTranslation<VercelDashboardTranslations, VercelDashboardTranslationKeys>()
}
