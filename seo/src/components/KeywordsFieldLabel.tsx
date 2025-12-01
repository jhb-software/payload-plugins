'use client'
import { useLocale } from '@payloadcms/ui'
import React from 'react'

/** An improved array label which properly adds the required and localized indicator. */
export const KeywordsFieldLabel = ({
  field,
}: {
  field: { required: boolean; localized: boolean }
}) => {
  const locale = useLocale()

  return (
    <label
      className="field-label"
      htmlFor="field-meta__keywords"
      style={{ fontWeight: 500, fontSize: '1.25rem' }}
    >
      Keywords {field.required ? <span className="required">*</span> : ''}
      {field.localized && <span className="localized">— {locale.label as string}</span>}
    </label>
  )
}

export default KeywordsFieldLabel
