'use client'

import { useTranslation } from '@payloadcms/ui'

import type {
  VercelDeploymentsTranslationKeys,
  VercelDeploymentsTranslations,
} from '../translations/index.js'

/**
 * Custom hook which provides type-safe access to dashboard-specific translations.
 */
export function useDashboardTranslation() {
  return useTranslation<VercelDeploymentsTranslations, VercelDeploymentsTranslationKeys>()
}
