import { SelectType } from 'payload'

/**
 * Determines the select type of the select object.
 */
export function getSelectType(select: SelectType | unknown): 'include' | 'exclude' | undefined {
  if (!select || typeof select !== 'object') return undefined

  const isPositive = Object.entries(select).some(
    ([_, value]) =>
      value === true ||
      (typeof value === 'object' && value !== null && getSelectType(value) === 'include'),
  )
  const isNegative = Object.entries(select).some(
    ([_, value]) =>
      value === false ||
      (typeof value === 'object' && value !== null && getSelectType(value) === 'exclude'),
  )

  if (isPositive) return 'include'
  if (isNegative) return 'exclude'
  return undefined
}
