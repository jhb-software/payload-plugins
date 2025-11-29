'use client'
import type { TextFieldClientProps } from 'payload'

import {
  FieldLabel,
  TextInput,
  useConfig,
  useField,
  useFormFields,
  useLocale,
} from '@payloadcms/ui'

import type { Breadcrumb } from '../../types/Breadcrumb.js'
import type { Locale } from '../../types/Locale.js'

import { getBreadcrumbs as getBreadcrumbsForDoc } from '../../utils/getBreadcrumbs.js'
import { pathFromBreadcrumbs } from '../../utils/pathFromBreadcrumbs.js'
import { useDidUpdateEffect } from '../../utils/useDidUpdateEffect.js'
import { BreadcrumbsFieldModalButton } from './BreadcrumbsField.js'
import { useBreadcrumbs } from './hooks/useBreadcrumbs.js'

export type PathFieldClientProps = {
  breadcrumbLabelField: string
  parentCollection: string
  parentFieldName: string
} & TextFieldClientProps

export const PathFieldClient = ({
  breadcrumbLabelField,
  field,
  parentCollection,
  parentFieldName,
  path: fieldPath,
}: PathFieldClientProps) => {
  const { config } = useConfig()
  const { code: locale } = useLocale() as unknown as { code: Locale | undefined }
  const { getBreadcrumbs, setBreadcrumbs } = useBreadcrumbs()
  const { setValue: setPathRaw, value: path } = useField<string>({ path: fieldPath })
  const { setValue: setSlugRaw, value: slug } = useField<string>({ path: 'slug' })
  const breadcrumbLabel = useFormFields(([fields, _]) => fields[breadcrumbLabelField])?.value as
    | string
    | undefined
  const parent = useFormFields(([fields, _]) => fields[parentFieldName])?.value as
    | string
    | undefined
  const isRootPage = useFormFields(([fields, _]) => fields.isRootPage)?.value as boolean | undefined

  /**
   * Sets the path, but only if the new path is different from the current path.
   * This prevents the "leave without saving" warning from being shown every time a document is opened without it being actually modified.
   * */
  const setPath = (newPath: string) => {
    if (newPath !== path) {
      setPathRaw(newPath)
    }
  }

  /**
   * Sets the slug, but only if the new slug is different from the current slug.
   * This prevents the "leave without saving" warning from being shown every time a document is opened without it being actually modified.
   */
  const setSlug = (newSlug: string) => {
    if (newSlug !== slug) {
      setSlugRaw(newSlug)
    }
  }

  /**
   * Fetches the the full list of breadcrumbs for the current document.
   */
  async function fetchBreadcrumbs(): Promise<Breadcrumb[]> {
    // Construct the document with all necessary fields
    const doc: Record<string, any> = {
      slug,
      isRootPage,
    }
    doc[parentFieldName] = parent
    doc[breadcrumbLabelField] = breadcrumbLabel

    const fechtchedBreadcrumbs = (await getBreadcrumbsForDoc({
      breadcrumbLabelField,
      data: doc,
      locale,
      locales:
        typeof config.localization === 'object' && config.localization.localeCodes
          ? config.localization.localeCodes
          : undefined,
      parentCollection,
      parentField: parentFieldName,
      req: undefined, // payload req is not available here
    })) as Breadcrumb[]

    return fechtchedBreadcrumbs
  }

  // update the breadcrumbs and path when
  //  - the parent changes
  useDidUpdateEffect(() => {
    const fetchAndSetData = async () => {
      // the parent was added:
      if (parent) {
        const fechtchedBreadcrumbs = await fetchBreadcrumbs()

        const updatedPath = pathFromBreadcrumbs({
          breadcrumbs: fechtchedBreadcrumbs,
          locale,
        })

        setBreadcrumbs(fechtchedBreadcrumbs)
        setPath(updatedPath)
        // the parent was removed:
      } else {
        const breadcrumbs = getBreadcrumbs() ?? []

        // remove all breadcrumbs except the last one of this doc if the parent was removed
        const updatedBreadcrumbs = breadcrumbs.length >= 2 ? breadcrumbs.slice(-1) : []
        const updatedPath = pathFromBreadcrumbs({ breadcrumbs: updatedBreadcrumbs, locale })

        setPath(updatedPath)
        setBreadcrumbs(updatedBreadcrumbs)
      }
    }
    void fetchAndSetData()

    // This effect should only be executed when the parent changes:
  }, [parent])

  // Update the breadcrumbs and path when
  //  - the slug changes
  //  - the field used for the breadcrumb label changes
  useDidUpdateEffect(() => {
    const fetchAndSetData = async () => {
      let breadcrumbs = getBreadcrumbs()

      if (!breadcrumbs || breadcrumbs.length === 0) {
        if (parent) {
          // Fetching the virtual breadcrumbs field in this case fixes the issue that when creating a localized version of an existing document
          // with a parent set, the breadcrumbs do not show the parent breadcrumbs in the UI when setting the slug.
          const fechtchedBreadcrumbs = await fetchBreadcrumbs()
          breadcrumbs = fechtchedBreadcrumbs
        } else {
          // there should always be at least one breadcrumb
          breadcrumbs = [
            {
              slug: '',
              label: '',
              path: '',
            },
          ]
        }
      }

      // update the slug and title in the breadcrumbs
      const updatedBreadcrumbsSlug: Breadcrumb[] = breadcrumbs.map((breadcrumb, index) =>
        index === breadcrumbs.length - 1
          ? {
              slug,
              label: breadcrumbLabel as string,
              path: breadcrumb.path,
            }
          : {
              slug: breadcrumb.slug,
              label: breadcrumb.label,
              path: breadcrumb.path,
            },
      )

      // generate the path
      const updatedPath = pathFromBreadcrumbs({
        breadcrumbs: updatedBreadcrumbsSlug,
        locale,
      })

      // update the path in the breadcrumbs
      const updatedBreadcrumbsPath: Breadcrumb[] = updatedBreadcrumbsSlug.map(
        (breadcrumb, index) =>
          index === breadcrumbs.length - 1
            ? {
                slug: breadcrumb.slug,
                label: breadcrumb.label,
                path: updatedPath,
              }
            : {
                slug: breadcrumb.slug,
                label: breadcrumb.label,
                path: breadcrumb.path,
              },
      )

      setPath(updatedPath)
      setBreadcrumbs(updatedBreadcrumbsPath)
    }

    void fetchAndSetData()

    // this effect should only be executed when the slug or the breadcrumb label changes:
  }, [slug, breadcrumbLabel])

  // Update the breadcrumbs and path, when
  // - the page was set to be the root page
  useDidUpdateEffect(() => {
    if (isRootPage === true) {
      setSlug('')
      setPath('/' + locale + '/')
      setBreadcrumbs([{ slug: '', label: breadcrumbLabel ?? '', path: '/' + (locale ?? '') }])
    }

    // this effect should only be executed when isRootPage changes:
  }, [isRootPage])

  return (
    <div className="field-type path-field-component">
      <FieldLabel
        htmlFor={`field-${path}`}
        label={field.label}
        localized={field.localized}
        required={field.required}
      />

      <div style={{ position: 'relative' }}>
        <TextInput path={path} readOnly value={path} />

        <div
          style={{ position: 'absolute', right: '0', top: '50%', transform: 'translateY(-50%)' }}
        >
          <BreadcrumbsFieldModalButton />
        </div>
      </div>
    </div>
  )
}
