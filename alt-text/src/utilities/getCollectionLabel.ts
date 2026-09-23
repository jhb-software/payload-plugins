import type { I18nClient } from '@payloadcms/translations'
import type { SanitizedCollectionConfig } from 'payload'

import { getTranslation } from '@payloadcms/translations'

export function getCollectionLabel(
  slug: string,
  collections: SanitizedCollectionConfig[],
  i18n: I18nClient,
): string {
  const label = collections.find((c) => c.slug === slug)?.labels?.plural

  return label ? getTranslation(label, i18n) : slug
}
