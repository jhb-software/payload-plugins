import { getSelectMode } from 'payload/shared'

/**
 * Checks if any virtual field is selected, based on the select object.
 * @param select The select object
 * @returns true if at least one virtual field is selected, false otherwise
 */
export function hasVirtualFieldSelected(select: Record<string, any> | undefined): boolean {
  if (!select) return false

  const selectMode = getSelectMode(select)
  const selectedFields = Object.keys(select)
  const virtualFields = ['path', 'breadcrumbs', 'meta']

  if (selectMode === 'include') {
    // In include mode, check if any virtual field is included
    return virtualFields.some((field) => selectedFields.includes(field))
  } else {
    // In exclude mode, check if NOT all virtual fields have been deselected
    // (at least one is not excluded)
    return !virtualFields.every((field) => selectedFields.includes(field))
  }
}
