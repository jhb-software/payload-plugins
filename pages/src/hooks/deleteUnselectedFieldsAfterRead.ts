import { CollectionAfterReadHook, SelectType } from 'payload'
import { getSelectType } from '../utils/getSelectType.js'

/**
 * A CollectionAfterReadHook that deletes fields from the document that are not in the original select.
 *
 * This is necessary because during the read operation, the original select is extended with all fields
 * that are required for the setVirtualFields hook to work.
 */
export const deleteUnselectedFieldsAfterRead: CollectionAfterReadHook = ({ doc, context }) => {
  const originalSelect = context.originalSelect as SelectType | undefined
  const select = context.select as SelectType | undefined

  // if there is no original select, this means that the selection was not altered, therefore return early.
  if (!originalSelect) {
    return doc
  }

  const selectType = getSelectType(originalSelect)

  if (selectType === 'include') {
    // remove all fields that are not in the original select (except id)
    Object.keys(doc).forEach((field) => {
      if (!originalSelect[field] && field !== 'id') {
        delete doc[field]
      }
    })
  } else if (selectType === 'exclude') {
    // remove all fields that were added to the select (present in originalSelect but not in select)
    const addedFields = Object.keys(originalSelect || {}).filter(
      (field) => !select?.[field] && field !== 'id',
    )

    addedFields.forEach((field) => {
      delete doc[field]
    })
  }

  return doc
}
