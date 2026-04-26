'use client'

import type { TextareaFieldClientProps } from 'payload'

import { FieldLabel, TextareaInput, useDocumentInfo, useField } from '@payloadcms/ui'

import { matchesMimeType } from '../utilities/mimeTypes.js'
import { GenerateAltTextButton } from './GenerateAltTextButton.js'

export const AltTextField = (clientProps: TextareaFieldClientProps) => {
  const { field, path } = clientProps

  const supportedMimeTypes = field.admin?.custom?.supportedMimeTypes as string[] | undefined
  const trackedMimeTypes = field.admin?.custom?.trackedMimeTypes as string[] | undefined

  const { setValue, value } = useField<string>({ path })
  const { id } = useDocumentInfo()
  const { value: mimeType } = useField<string>({ path: 'mimeType' })

  const isTrackedMimeType =
    !trackedMimeTypes ||
    trackedMimeTypes.length === 0 ||
    (!!mimeType && matchesMimeType(mimeType, trackedMimeTypes))

  if (!isTrackedMimeType) {
    return null
  }

  // the field should be optional when the document is created
  // (since the alt text generation can only be used once the document is created and the image uploaded)
  const required = id ? field.required : false

  return (
    <div className="field-type textarea" style={{ flex: '1 1 auto' }}>
      <FieldLabel
        htmlFor={`field-${path}`}
        label={field.label}
        localized={field.localized}
        required={required}
      />

      <div className="field-type__wrap">
        <TextareaInput
          AfterInput={<GenerateAltTextButton supportedMimeTypes={supportedMimeTypes} />}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
          path={path}
          required={required}
          value={value}
        />
      </div>
    </div>
  )
}
