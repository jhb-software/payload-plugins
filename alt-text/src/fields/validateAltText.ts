import type { TextareaFieldValidation } from 'payload'

const isEmpty = (v: unknown): boolean =>
  v == null || (typeof v === 'string' && v.trim().length === 0)

/**
 * Validates the alt text field.
 *
 * - Initial upload (`create`, or first save where `createdAt === updatedAt`):
 *   skipped so the AI can fill the value in after the file is uploaded.
 * - If the `alt` field is not part of the incoming request body
 *   (`req.data`), validation is skipped. This covers folder moves and
 *   partial updates that do not touch alt text. see https://github.com/jhb-software/payload-plugins/issues/95
 * - If alt text is being actively submitted (present in the request body) or
 *   the field is being cleared (previous value was filled but new value is
 *   empty), a non-empty value is required.
 */
export const validateAltText: TextareaFieldValidation = (value, { data, operation, req }) => {
  // Since https://github.com/payloadcms/payload/pull/14988, when using external storage (e.g., S3),
  // it is no longer possible to detect whether this validation runs during the initial upload
  // or a regular update by checking the existence of the ID.
  // Instead, compare the timestamps of the createdAt and updatedAt fields.
  const isInitialUpload =
    operation === 'create' ||
    (!!data && 'createdAt' in data && 'updatedAt' in data && data.createdAt === data.updatedAt)

  if (isInitialUpload) {
    return true
  }

  const altSubmitted = !!req.data && 'alt' in req.data

  if (!altSubmitted) {
    // Alt is not part of this request's payload (folder move, partial update,
    // or any operation that does not touch alt). Skip validation.
    return true
  }

  if (!isEmpty(value)) {
    return true
  }

  // @ts-expect-error - the translation key type does not include the custom key
  return req.t('@jhb.software/payload-alt-text-plugin:theAlternateTextIsRequired')
}
