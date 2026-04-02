export const MAX_INVALID_DOC_IDS = 100

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasAltValue = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0

const countFilledLocales = (altValue: unknown, localeCodes: string[]): number => {
  if (!isRecord(altValue)) {
    return 0
  }

  return localeCodes.filter((localeCode) => hasAltValue(altValue[localeCode])).length
}

export function summarizeCollection({
  collection,
  docs,
  isLocalized,
  localeCodes,
}: {
  collection: string
  docs: { alt: unknown; id: number | string }[]
  isLocalized: boolean
  localeCodes: string[]
}) {
  let completeDocs = 0
  let missingDocs = 0
  let partialDocs = 0
  let invalidDocIds: (number | string)[] | undefined = []
  let invalidOverflow = false

  for (const doc of docs) {
    if (!isLocalized) {
      if (hasAltValue(doc.alt)) {
        completeDocs++
      } else {
        missingDocs++
        if (!invalidOverflow) {
          if (invalidDocIds!.length < MAX_INVALID_DOC_IDS) {
            invalidDocIds!.push(doc.id)
          } else {
            invalidDocIds = undefined
            invalidOverflow = true
          }
        }
      }

      continue
    }

    const filledLocales = countFilledLocales(doc.alt, localeCodes)

    if (filledLocales === localeCodes.length) {
      completeDocs++
    } else {
      if (filledLocales === 0) {
        missingDocs++
      } else {
        partialDocs++
      }

      if (!invalidOverflow) {
        if (invalidDocIds!.length < MAX_INVALID_DOC_IDS) {
          invalidDocIds!.push(doc.id)
        } else {
          invalidDocIds = undefined
          invalidOverflow = true
        }
      }
    }
  }

  return {
    collection,
    completeDocs,
    invalidDocIds,
    missingDocs,
    partialDocs,
    totalDocs: docs.length,
  }
}
