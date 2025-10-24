'use client'

import { FieldLabel, TextareaInput, useDocumentInfo, useField } from '@payloadcms/ui'
import type { TextareaFieldClientProps } from 'payload'

import { GenerateAltTextButton } from './GenerateAltTextButton.js'

export const AltTextField = (clientProps: TextareaFieldClientProps) => {
  const { field, path } = clientProps

  const { value, setValue } = useField<string>({ path })
  const { id } = useDocumentInfo()

  // the field should be optional when the document is created
  // (since the alt text generation can only be used once the document is created and the image uploaded)
  const required = id ? field.required : false

  return (
    <div className="field-type textarea" style={{ flex: '1 1 auto' }}>
      <FieldLabel
        htmlFor={`field-${path}`}
        label={field.label}
        required={required}
        localized={field.localized}
      />

      <div className="field-type__wrap">
        <TextareaInput
          value={value}
          path={path!}
          required={required}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
          AfterInput={<GenerateAltTextButton />}
        />
      </div>
    </div>
  )
}
