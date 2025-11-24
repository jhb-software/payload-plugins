'use client'
import {
  Banner,
  Button,
  FieldLabel,
  TextInput,
  Tooltip,
  useDocumentInfo,
  useField,
  useFormModified,
  useLocale,
} from '@payloadcms/ui'
import type { TextFieldClientProps } from 'payload'
import { useEffect, useState } from 'react'
import { formatSlug, liveFormatSlug } from '../../hooks/validateSlug.js'
import { usePluginTranslation } from '../../utils/usePluginTranslations.js'
import { RefreshIcon } from '../../icons/RefreshIcon.js'
import { useCreateRedirect } from '../../hooks/useCreateRedirect.js'
import { pathFromBreadcrumbs } from '../../utils/pathFromBreadcrumbs.js'
import { useBreadcrumbs } from '../client/hooks/useBreadcrumbs.js'

export type SlugFieldProps = {
  pageSlug: boolean | undefined
  fallbackField: string
  readOnly: boolean | undefined
  defaultValue: string | Record<string, string> | undefined
  redirectsCollectionSlug: string
}

export const SlugFieldClient = (clientProps: TextFieldClientProps & SlugFieldProps) => {
  const { field, path, readOnly, pageSlug, fallbackField, defaultValue, redirectsCollectionSlug } =
    clientProps

  const { value: title } = useField<string>({ path: fallbackField })
  const { initialData, hasPublishedDoc, id } = useDocumentInfo()
  const initialSlug = initialData?.[path]
  const { value: slug, setValue: setSlugRaw } = useField<string>({ path: path })
  const [showSyncButtonTooltip, setShowSyncButtonTooltip] = useState(false)
  const { value: isRootPage } = useField<boolean>({ path: 'isRootPage' })
  const locale = useLocale()
  const { t } = usePluginTranslation()
  const { createRedirect, isCreating, isSuccess } = useCreateRedirect(redirectsCollectionSlug)
  const { getBreadcrumbs } = useBreadcrumbs()
  const modified = useFormModified()

  /**
   * Sets the slug, but only if the new slug is different from the current slug.
   * This prevents the useFormModified from being true without it being actually modified.
   * */
  const setSlug = (newSlug: string | undefined) => {
    if (newSlug !== slug) {
      setSlugRaw(newSlug)
    }
  }

  const showRedirectWarning =
    initialSlug && pageSlug && initialSlug !== slug && hasPublishedDoc && modified

  const handleCreateRedirect = async () => {
    try {
      const breadcrumbs = getBreadcrumbs() || []

      // Calculate old path (with initial slug)
      const oldPath = pathFromBreadcrumbs({
        locale: locale.code,
        breadcrumbs: breadcrumbs.slice(0, -1), // Remove current page
        additionalSlug: initialSlug,
      })

      // Calculate new path (with current slug)
      const newPath = pathFromBreadcrumbs({
        locale: locale.code,
        breadcrumbs: breadcrumbs.slice(0, -1), // Remove current page
        additionalSlug: slug,
      })

      await createRedirect(oldPath, newPath)
    } catch (error) {
      // Error is handled by the hook with toast
    }
  }

  useEffect(() => {
    if (isRootPage) {
      // do not change the slug when the document is the root page
      return
    }

    // Only update the slug when editing the title when the document is not published to avoid
    // the creation of a redirection due to the slug change
    if (!hasPublishedDoc) {
      // Payload automatically sets the title to "[Untitled]" when the document is created and to id when the title field
      // for an existing document is empty. In this cases, and when the title is not set, clear the slug.
      if (!title || title === id || title === '[Untitled]') {
        setSlug(undefined)
      } else {
        setSlug(formatSlug(title))
      }
    }

    // Only the title should trigger this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])

  // When a defaultValue is given and the field is readOnly, the staticValue option is used.
  // In this case, ensure the slug is set to the defaultValue.
  useEffect(() => {
    if (defaultValue && readOnly) {
      const staticValue =
        typeof defaultValue === 'string' ? defaultValue : defaultValue[locale.code]

      if (staticValue !== slug) {
        setSlug(staticValue)
      }
    }
  }, [defaultValue, readOnly, slug])

  if (isRootPage === true) {
    return <></>
  }

  // TextField component could not be used here, because it does not support the onChange event
  return (
    <>
      <div className="field-type slug-field-component">
        <FieldLabel
          htmlFor={`field-${path}`}
          label={field.label}
          required={field.required}
          localized={field.localized}
        />

        <div style={{ position: 'relative' }}>
          <TextInput
            value={slug}
            path={path!}
            readOnly={readOnly}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setSlug(liveFormatSlug(e.target.value))
            }}
          />
          {!readOnly && title && formatSlug(title) !== slug && (
            <div
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              <>
                <Tooltip show={showSyncButtonTooltip}>
                  {t('syncSlugWithX').replace(
                    '{X}',
                    fallbackField.charAt(0).toUpperCase() + fallbackField.slice(1),
                  )}
                </Tooltip>

                <button
                  type="button"
                  onClick={() => {
                    setSlug(formatSlug(title))
                    setShowSyncButtonTooltip(false)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'var(--theme-elevation-500)',
                    transition: 'color 0.2s',
                    transform: 'scale(0.5)',
                  }}
                  onMouseEnter={(_) => setShowSyncButtonTooltip(true)}
                  onMouseLeave={(_) => setShowSyncButtonTooltip(false)}
                >
                  <RefreshIcon />
                </button>
              </>
            </div>
          )}
        </div>

        {showRedirectWarning && (
          <div style={{ marginTop: '0.5rem' }}>
            <Banner type="info" icon={<InfoIcon />} alignIcon="left">
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{ marginLeft: '0.5rem' }}
                  dangerouslySetInnerHTML={{
                    __html: t('slugWasChangedFromXToY')
                      .replace('{X}', initialSlug)
                      .replace('{Y}', slug),
                  }}
                />
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginLeft: '0.5rem' }}
                >
                  <Button
                    size="small"
                    buttonStyle="secondary"
                    onClick={handleCreateRedirect}
                    disabled={isCreating || isSuccess}
                    margin={false}
                  >
                    {t(isSuccess ? 'redirectCreated' : isCreating ? 'creating' : 'createRedirect')}
                  </Button>
                  <Button
                    size="small"
                    buttonStyle="secondary"
                    onClick={() => setSlug(initialSlug)}
                    disabled={isCreating || isSuccess}
                    margin={false}
                  >
                    {t('revertSlug')}
                  </Button>
                </div>
              </div>
            </Banner>
          </div>
        )}
      </div>
    </>
  )
}

// InfoIcon - keeping as custom for now since Payload's Info icon may not be publicly accessible
const InfoIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 16V12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="8" r="1" fill="currentColor" />
  </svg>
)

export default SlugFieldClient
