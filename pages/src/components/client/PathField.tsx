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
import { rootPathFromPrefixes } from '../../utils/localePrefix.js'
import { parentRefKey, tryResolveParentRef } from '../../utils/parentRef.js'
import { pathFromBreadcrumbs } from '../../utils/pathFromBreadcrumbs.js'
import { useDidUpdateEffect } from '../../utils/useDidUpdateEffect.js'
import { BreadcrumbsFieldModalButton } from './BreadcrumbsField.js'
import { useBreadcrumbs } from './hooks/useBreadcrumbs.js'
import { usePageCollectionConfigAttributes } from './hooks/usePageCollectionConfigAtrributes.js'

export type PathFieldProps = {
  /** Each locale's path prefix, resolved on the server from the plugin's `localeRouting`. */
  localePrefixes?: Record<Locale, string>
}

export const PathField = ({
  field,
  localePrefixes,
  path: fieldPath,
}: PathFieldProps & TextFieldClientProps) => {
  const { config } = useConfig()
  const pageConfig = usePageCollectionConfigAttributes()
  const {
    breadcrumbs: { labelField: breadcrumbLabelFieldName },
    parent: { name: parentField },
  } = pageConfig
  const { code: locale } = useLocale() as unknown as { code: Locale | undefined }
  const { getBreadcrumbs, setBreadcrumbs } = useBreadcrumbs()
  const { setValue: setPathRaw, value: path } = useField<string>({ path: fieldPath })
  const { setValue: setSlugRaw, value: slug } = useField<string>({ path: 'slug' })
  const breadcrumbLabel = useFormFields(([fields, _]) => fields[breadcrumbLabelFieldName])
    ?.value as string | undefined
  const parent = useFormFields(([fields, _]) => fields[parentField])?.value
  const isRootPage = useFormFields(([fields, _]) => fields.isRootPage)?.value as boolean | undefined
  // A value which does not name its collection cannot be turned into a path; the save is
  // refused server-side, so the preview treats it as no parent rather than crashing the editor.
  const parentRef = tryResolveParentRef(parent, pageConfig)
  // A polymorphic parent's value is an object, whose identity changes on every render. The
  // effects below must re-run when the parent actually changes, not on every render, so they
  // depend on this key rather than on the value.
  const parentKey = parentRef ? parentRefKey(parentRef) : ''

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
    doc[parentField] = parent
    doc[breadcrumbLabelFieldName] = breadcrumbLabel

    const fechtchedBreadcrumbs = (await getBreadcrumbsForDoc({
      apiURL: `${config.serverURL ?? ''}${config.routes.api}`,
      data: doc,
      locale,
      localePrefixes,
      locales:
        typeof config.localization === 'object' && config.localization.localeCodes
          ? config.localization.localeCodes
          : undefined,
      pageConfig,
      req: undefined, // payload req is not available here
    })) as Breadcrumb[]

    return fechtchedBreadcrumbs
  }

  // update the breadcrumbs and path when
  //  - the parent changes
  useDidUpdateEffect(() => {
    const fetchAndSetData = async () => {
      // the parent was added:
      if (parentRef) {
        const fechtchedBreadcrumbs = await fetchBreadcrumbs()

        const updatedPath = pathFromBreadcrumbs({
          breadcrumbs: fechtchedBreadcrumbs,
          locale,
          localePrefixes,
        })

        setBreadcrumbs(fechtchedBreadcrumbs)
        setPath(updatedPath)
        // the parent was removed:
      } else {
        const breadcrumbs = getBreadcrumbs() ?? []

        // remove all breadcrumbs except the last one of this doc if the parent was removed
        const updatedBreadcrumbs = breadcrumbs.length >= 2 ? breadcrumbs.slice(-1) : []
        const updatedPath = pathFromBreadcrumbs({
          breadcrumbs: updatedBreadcrumbs,
          locale,
          localePrefixes,
        })

        setPath(updatedPath)
        setBreadcrumbs(updatedBreadcrumbs)
      }
    }
    void fetchAndSetData()

    // This effect should only be executed when the parent changes:
  }, [parentKey])

  // Update the breadcrumbs and path when
  //  - the slug changes
  //  - the field used for the breadcrumb label changes
  useDidUpdateEffect(() => {
    const fetchAndSetData = async () => {
      let breadcrumbs = getBreadcrumbs()

      if (!breadcrumbs || breadcrumbs.length === 0) {
        if (parentRef) {
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
        localePrefixes,
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
      const rootPath = rootPathFromPrefixes(localePrefixes, locale)
      setSlug('')
      setPath(rootPath)
      setBreadcrumbs([{ slug: '', label: breadcrumbLabel ?? '', path: rootPath }])
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
