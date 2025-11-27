'use client'
import type { TextFieldClientProps } from 'payload'

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
import { useCallback, useEffect, useState } from 'react'

import { useCreateRedirect } from '../../hooks/useCreateRedirect.js'
import { formatSlug, liveFormatSlug } from '../../hooks/validateSlug.js'
import { RefreshIcon } from '../../icons/RefreshIcon.js'
import { pathFromBreadcrumbs } from '../../utils/pathFromBreadcrumbs.js'
import { usePluginTranslation } from '../../utils/usePluginTranslations.js'
import { useBreadcrumbs } from '../client/hooks/useBreadcrumbs.js'

export type SlugFieldProps = {
  defaultValue: Record<string, string> | string | undefined
  fallbackField: string
  pageSlug: boolean | undefined
  readOnly: boolean | undefined
  redirectsCollectionSlug: string
}

export const SlugFieldClient = (clientProps: SlugFieldProps & TextFieldClientProps) => {
  const { defaultValue, fallbackField, field, pageSlug, path, readOnly, redirectsCollectionSlug } =
    clientProps

  const { value: title } = useField<string>({ path: fallbackField })
  const { id, hasPublishedDoc, initialData } = useDocumentInfo()
  const initialSlug = initialData?.[path]
  const { setValue: setSlugRaw, value: slug } = useField<string>({ path })
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
  const setSlug = useCallback(
    (newSlug: string | undefined) => {
      if (newSlug !== slug) {
        setSlugRaw(newSlug)
      }
    },
    [slug, setSlugRaw],
  )

  const showRedirectWarning =
    initialSlug && pageSlug && initialSlug !== slug && hasPublishedDoc && modified

  const handleCreateRedirect = async () => {
    try {
      const breadcrumbs = getBreadcrumbs() || []

      // Calculate old path (with initial slug)
      const oldPath = pathFromBreadcrumbs({
        additionalSlug: initialSlug,
        breadcrumbs: breadcrumbs.slice(0, -1), // Remove current page
        locale: locale.code,
      })

      // Calculate new path (with current slug)
      const newPath = pathFromBreadcrumbs({
        additionalSlug: slug,
        breadcrumbs: breadcrumbs.slice(0, -1), // Remove current page
        locale: locale.code,
      })

      await createRedirect(oldPath, newPath)
    } catch (_) {
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
  }, [defaultValue, locale.code, readOnly, setSlug, slug])

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
          localized={field.localized}
          required={field.required}
        />

        <div style={{ position: 'relative' }}>
          <TextInput
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setSlug(liveFormatSlug(e.target.value))
            }}
            path={path}
            readOnly={readOnly}
            value={slug}
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
                  onClick={() => {
                    setSlug(formatSlug(title))
                    setShowSyncButtonTooltip(false)
                  }}
                  onMouseEnter={(_) => setShowSyncButtonTooltip(true)}
                  onMouseLeave={(_) => setShowSyncButtonTooltip(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--theme-elevation-500)',
                    cursor: 'pointer',
                    padding: 0,
                    transform: 'scale(0.5)',
                    transition: 'color 0.2s',
                  }}
                  type="button"
                >
                  <RefreshIcon />
                </button>
              </>
            </div>
          )}
        </div>

        {showRedirectWarning && (
          <div style={{ marginTop: '0.5rem' }}>
            <Banner alignIcon="left" icon={<InfoIcon />} type="info">
              <div
                style={{
                  alignItems: 'flex-start',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div
                  dangerouslySetInnerHTML={{
                    __html: t('slugWasChangedFromXToY')
                      .replace('{X}', initialSlug)
                      .replace('{Y}', slug),
                  }}
                  style={{ marginLeft: '0.5rem' }}
                />
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginLeft: '0.5rem' }}
                >
                  <Button
                    buttonStyle="secondary"
                    disabled={isCreating || isSuccess}
                    margin={false}
                    onClick={handleCreateRedirect}
                    size="small"
                  >
                    {t(isSuccess ? 'redirectCreated' : isCreating ? 'creating' : 'createRedirect')}
                  </Button>
                  <Button
                    buttonStyle="secondary"
                    disabled={isCreating || isSuccess}
                    margin={false}
                    onClick={() => setSlug(initialSlug)}
                    size="small"
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
  <svg fill="none" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <path
      d="M12 16V12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <circle cx="12" cy="8" fill="currentColor" r="1" />
  </svg>
)

export default SlugFieldClient
