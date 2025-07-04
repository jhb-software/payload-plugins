'use client'
import {
  Banner,
  FieldLabel,
  TextInput,
  Tooltip,
  useDocumentInfo,
  useField,
  useLocale,
} from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import { useEffect, useState } from 'react'
import { formatSlug, liveFormatSlug } from '../../hooks/validateSlug.js'
import { usePluginTranslation } from '../../utils/usePluginTranslations.js'

export type SlugFieldClientProps = {
  pageSlug?: boolean
  fallbackField: string
  readOnly?: boolean
  defaultValue?: string | Record<string, string> | undefined
}

export const SlugField: TextFieldClientComponent = (clientProps) => {
  const { field, path, readOnly } = clientProps
  const { pageSlug, fallbackField, defaultValue } = clientProps as unknown as SlugFieldClientProps

  const { value: title } = useField<string>({ path: fallbackField })
  const { initialData, hasPublishedDoc, id } = useDocumentInfo()
  const initialSlug = initialData?.[path]
  const { value: slug, setValue: setSlugRaw } = useField<string>({ path: path })
  const [showSyncButtonTooltip, setShowSyncButtonTooltip] = useState(false)
  const { value: isRootPage } = useField<boolean>({ path: 'isRootPage' })
  const locale = useLocale()
  const { t } = usePluginTranslation()

  /**
   * Sets the slug, but only if the new slug is different from the current slug.
   * This prevents the useFormModified from being true without it being actually modified.
   * */
  const setSlug = (newSlug: string | undefined) => {
    if (newSlug !== slug) {
      setSlugRaw(newSlug)
    }
  }

  // TODO: create and use a mustCreateRedirect function to determine if a redirect must be created
  // Then inside an afterChange hook use this same function to automatically create the redirect
  const showRedirectWarning = initialSlug && pageSlug && initialSlug !== slug && hasPublishedDoc

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
                style={{ marginLeft: '0.5rem' }}
                dangerouslySetInnerHTML={{
                  __html: t('slugWasChangedFromXToY')
                    .replace('{X}', initialSlug)
                    .replace('{Y}', slug),
                }}
              />
            </Banner>
          </div>
        )}
      </div>
    </>
  )
}

export default SlugField

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

const RefreshIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
)
