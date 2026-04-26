import type { TextareaFieldValidation } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { validateAltText } from '../src/utilities/mimeTypes.ts'

// Each entry in `collections` accepts a `validate` function that is forwarded
// verbatim to the alt field (see plugin.ts → altTextField.ts). When unset, the
// field falls back to the exported `validateAltText`.
//
// These tests cover the documented composition pattern users follow to loosen
// the default — for example, to skip validation when the request body does not
// touch `alt` (folder moves, partial API updates).

const t = (key: string) => key
type Args = Parameters<TextareaFieldValidation>[1]
const asArgs = (args: object) => args as Args

const updateArgs = asArgs({
  data: {
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    mimeType: 'image/png',
  },
  operation: 'update',
  req: { t },
})

describe('custom validate composition', () => {
  test('a validator that delegates to validateAltText skips folder moves but still requires submitted alt', () => {
    const customValidator: TextareaFieldValidation = (value, args) => {
      const reqData = (args.req as { data?: Record<string, unknown> }).data
      if (!reqData || !('alt' in reqData)) return true
      return validateAltText(value, args, ['image/*'])
    }

    const folderMove = customValidator(
      null,
      asArgs({ ...updateArgs, req: { data: { folder: 'folder-id' }, t } }),
    )
    assert.equal(folderMove, true)

    const partialUpdate = customValidator(
      null,
      asArgs({ ...updateArgs, req: { data: { someOtherField: 'value' }, t } }),
    )
    assert.equal(partialUpdate, true)

    const submittedEmpty = customValidator(
      '',
      asArgs({ ...updateArgs, req: { data: { alt: '' }, t } }),
    )
    assert.equal(submittedEmpty, '@jhb.software/payload-alt-text-plugin:theAlternateTextIsRequired')

    const submittedFilled = customValidator(
      'A sunset',
      asArgs({ ...updateArgs, req: { data: { alt: 'A sunset' }, t } }),
    )
    assert.equal(submittedFilled, true)
  })
})
