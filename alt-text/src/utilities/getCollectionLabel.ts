import type { SanitizedCollectionConfig } from 'payload'

export function getCollectionLabel(
  slug: string,
  collections: SanitizedCollectionConfig[],
  locale: null | string | undefined,
): string {
  const collectionConfig = collections.find((c) => c.slug === slug)

  if (!collectionConfig?.labels?.plural) {
    return slug
  }

  const label = collectionConfig.labels.plural

  if (typeof label === 'string') {
    return label
  }

  if (typeof label === 'function') {
    return slug
  }

  const record = label as Record<string, string>

  return record[locale as string] ?? record[Object.keys(record)[0]] ?? slug
}
