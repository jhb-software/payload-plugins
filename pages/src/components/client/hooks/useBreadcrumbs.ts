'use client'

import { useAllFormFields, useForm } from '@payloadcms/ui'
import { Breadcrumb } from '../../../types/Breadcrumb.js'

/**
 * Hook to get and set the breadcrumbs of a document.
 *
 * The useFormFields hook is not used because of the following payload issue: https://github.com/payloadcms/payload/issues/8146
 */
export const useBreadcrumbs = () => {
  const [fields, dispatchFields] = useAllFormFields()
  const { getData } = useForm()

  const getBreadcrumbs = (): Breadcrumb[] => {
    return getData().breadcrumbs || []
  }

  /**
   * Sets the breadcrumbs, but only if the new breadcrumbs are different from the current breadcrumbs.
   * This prevents the "leave without saving" warning from being shown every time a document is opened without it being actually modified.
   */
  const setBreadcrumbs = (newBreadcrumbs: Breadcrumb[]) => {
    let breadcrumbs = getBreadcrumbs() as Breadcrumb[]

    // Compare breadcrumbs ignoring id field since it's not relevant for equality
    const areBreadcrumbsEqual = (a: Breadcrumb[], b: Breadcrumb[]) => {
      if (a.length !== b.length) return false
      return a.every((breadcrumb, i) => {
        // Sort keys to ensure consistent order when comparing
        const sortObject = (obj: any) => {
          return Object.keys(obj)
            .sort()
            .reduce((result: any, key) => {
              result[key] = obj[key]
              return result
            }, {})
        }

        const aWithoutId = sortObject({ ...breadcrumb, id: undefined })
        const bWithoutId = sortObject({ ...b[i], id: undefined })

        return JSON.stringify(aWithoutId) === JSON.stringify(bWithoutId)
      })
    }

    // Only update if breadcrumbs have actually changed
    if (!areBreadcrumbsEqual(breadcrumbs, newBreadcrumbs)) {
      setBreadcrumbsRaw(newBreadcrumbs)
    }
  }

  const setBreadcrumbsRaw = (newBreadcrumbs: Breadcrumb[]) => {
    const existingRowCount = fields.breadcrumbs?.rows?.length || 0

    newBreadcrumbs.forEach((breadcrumb, index) => {
      if (index < existingRowCount) {
        // Update existing row
        // NOTE: it is necessary to update each field individually
        dispatchFields({
          type: 'UPDATE',
          path: `breadcrumbs.${index}.label`,
          value: breadcrumb.label,
        })
        dispatchFields({
          type: 'UPDATE',
          path: `breadcrumbs.${index}.slug`,
          value: breadcrumb.slug,
        })

        dispatchFields({
          type: 'UPDATE',
          path: `breadcrumbs.${index}.path`,
          value: breadcrumb.path,
        })
      } else {
        // Add new row
        dispatchFields({
          type: 'ADD_ROW',
          path: 'breadcrumbs',
          rowIndex: index,
          subFieldState: {
            label: { value: breadcrumb.label, initialValue: breadcrumb.label, valid: true },
            slug: { value: breadcrumb.slug, initialValue: breadcrumb.slug, valid: true },
            path: { value: breadcrumb.path, initialValue: breadcrumb.path, valid: true },
          },
        })
      }
    })

    // Remove any extra rows
    for (let i = newBreadcrumbs.length; i < existingRowCount; i++) {
      dispatchFields({
        type: 'REMOVE_ROW',
        path: 'breadcrumbs',
        rowIndex: newBreadcrumbs.length,
      })
    }
  }

  return {
    getBreadcrumbs,
    setBreadcrumbs,
  }
}
