'use client'
import {
  FieldLabel,
  TextField,
  TextInput,
  useConfig,
  useField,
  useFormFields,
  useLocale,
} from '@payloadcms/ui'
import { TextFieldClientComponent } from 'payload'
import { Breadcrumb } from '../../types/Breadcrumb.js'
import { Locale } from '../../types/Locale.js'
import { getBreadcrumbs as getBreadcrumbsForDoc } from '../../utils/getBreadcrumbs.js'
import { pathFromBreadcrumbs } from '../../utils/pathFromBreadcrumbs.js'
import { useDidUpdateEffect } from '../../utils/useDidUpdateEffect.js'
import { usePageCollectionConfigAttributes } from './hooks/usePageCollectionConfigAtrributes.js'
import { useBreadcrumbs } from './hooks/useBreadcrumbs.js'
import { BreadcrumbsFieldModalButton } from './BreadcrumbsField.js'

export const PathField: TextFieldClientComponent = ({ field, path: fieldPath, schemaPath }) => {
  const { config } = useConfig()
  const {
    parent: { name: parentField, collection: parentCollection },
    breadcrumbs: { labelField: breadcrumbLabelFieldName },
    path: { pathPrefix } = {},
  } = usePageCollectionConfigAttributes()
  const { code: locale } = useLocale() as unknown as { code: Locale | undefined }
  const { getBreadcrumbs, setBreadcrumbs } = useBreadcrumbs()
  const { setValue: setPathRaw, value: path } = useField<string>({ path: fieldPath! })
  const { setValue: setSlugRaw, value: slug } = useField<string>({ path: 'slug' })
  const breadcrumbLabel = useFormFields(([fields, _]) => fields[breadcrumbLabelFieldName])
    ?.value as string | undefined
  const parent = useFormFields(([fields, _]) => fields[parentField])?.value as string | undefined
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
      slug: slug,
      isRootPage: isRootPage,
    }
    doc[parentField] = parent
    doc[breadcrumbLabelFieldName] = breadcrumbLabel

    const fechtchedBreadcrumbs = (await getBreadcrumbsForDoc({
      req: undefined, // payload req is not available here
      locales:
        typeof config.localization === 'object' && config.localization.localeCodes
          ? config.localization.localeCodes
          : undefined,
      breadcrumbLabelField: breadcrumbLabelFieldName,
      parentField: parentField,
      parentCollection: parentCollection,
      data: doc,
      locale: locale,
      pathPrefix: pathPrefix,
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
          locale: locale,
          breadcrumbs: fechtchedBreadcrumbs,
        })

        setBreadcrumbs(fechtchedBreadcrumbs)
        setPath(updatedPath)
        // the parent was removed:
      } else {
        const breadcrumbs = getBreadcrumbs() ?? []

        // remove all breadcrumbs except the last one of this doc if the parent was removed
        const updatedBreadcrumbs = breadcrumbs.length >= 2 ? breadcrumbs.slice(-1) : []
        const updatedPath = pathFromBreadcrumbs({ locale: locale, breadcrumbs: updatedBreadcrumbs })

        setPath(updatedPath)
        setBreadcrumbs(updatedBreadcrumbs)
      }
    }
    fetchAndSetData()

    // This effect should only be executed when the parent changes:
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              label: '',
              slug: '',
              path: '',
            },
          ]
        }
      }

      // update the slug and title in the breadcrumbs
      const updatedBreadcrumbsSlug: Breadcrumb[] = breadcrumbs.map((breadcrumb, index) =>
        index === breadcrumbs.length - 1
          ? {
              path: breadcrumb.path,
              slug: slug as string,
              label: breadcrumbLabel as string,
            }
          : {
              path: breadcrumb.path,
              slug: breadcrumb.slug,
              label: breadcrumb.label,
            },
      )

      // generate the path
      const updatedPath = pathFromBreadcrumbs({
        locale: locale,
        breadcrumbs: updatedBreadcrumbsSlug,
      })

      // update the path in the breadcrumbs
      const updatedBreadcrumbsPath: Breadcrumb[] = updatedBreadcrumbsSlug.map(
        (breadcrumb, index) =>
          index === breadcrumbs.length - 1
            ? {
                path: updatedPath,
                slug: breadcrumb.slug,
                label: breadcrumb.label,
              }
            : {
                path: breadcrumb.path,
                slug: breadcrumb.slug,
                label: breadcrumb.label,
              },
      )

      setPath(updatedPath)
      setBreadcrumbs(updatedBreadcrumbsPath)
    }

    fetchAndSetData()

    // this effect should only be executed when the slug or the breadcrumb label changes:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, breadcrumbLabel])

  // Update the breadcrumbs and path, when
  // - the page was set to be the root page
  useDidUpdateEffect(() => {
    if (isRootPage === true) {
      setSlug('')
      setPath('/' + locale + '/')
      setBreadcrumbs([{ label: breadcrumbLabel ?? '', slug: '', path: '/' + (locale ?? '') }])
    }

    // this effect should only be executed when the slug or the breadcrumb label changes:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRootPage])

  return (
    <div className="field-type path-field-component">
      <FieldLabel
        htmlFor={`field-${path}`}
        label={field.label}
        required={field.required}
        localized={field.localized}
      />

      <div style={{ position: 'relative' }}>
        <TextInput value={path} path={path!} readOnly />

        <div
          style={{ position: 'absolute', top: '50%', right: '0', transform: 'translateY(-50%)' }}
        >
          <BreadcrumbsFieldModalButton />
        </div>
      </div>
    </div>
  )
}
