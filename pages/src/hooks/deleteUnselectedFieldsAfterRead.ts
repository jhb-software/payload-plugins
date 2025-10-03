import { CollectionAfterReadHook, SelectType } from 'payload'

/**
 * A CollectionAfterReadHook that deletes fields from the document that are not in the original select.
 *
 * This is necessary because during the read operation, the original select is extended with all fields
 * that are required for the setVirtualFields hook to work.
 */
export const deleteUnselectedFieldsAfterRead: CollectionAfterReadHook = ({ doc, context }) => {
  const select = context.originalSelect as SelectType | undefined

  // Only keep fields from original select and id if there is an original select
  if (select && typeof select === 'object') {
    const fieldsToKeep = [...Object.keys(select), 'id']

    Object.keys(doc).forEach((field) => {
      if (!fieldsToKeep.includes(field)) {
        delete doc[field]
      }
    })
  }

  return doc
}
