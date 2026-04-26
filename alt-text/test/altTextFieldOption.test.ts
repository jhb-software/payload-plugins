import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { validateAltText } from '../src/utilities/mimeTypes.ts'

// The plugin exposes a `validate` option that is forwarded verbatim to the
// `alt` field (see plugin.ts → altTextField.ts). The field falls back to the
// exported `validateAltText` when no custom function is supplied.
//
// These tests cover the documented composition pattern users follow to
// loosen the default — for example, to skip validation when the request body
// does not touch `alt` (folder moves, partial API updates).

const t = (key: string) => key

const updateArgs = {
  data: {
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    mimeType: 'image/png',
  },
  operation: 'update',
  req: { t },
}

describe('custom validate composition', () => {
  test('a validator that delegates to validateAltText skips folder moves but still requires submitted alt', () => {
    const customValidator = (value: unknown, args: typeof updateArgs) => {
      const reqData = (args.req as { data?: Record<string, unknown> }).data
      if (!reqData || !('alt' in reqData)) return true
      return validateAltText(value, args, ['image/*'])
    }

    const folderMove = customValidator(null, {
      ...updateArgs,
      req: { data: { folder: 'folder-id' }, t },
    } as typeof updateArgs)
    assert.equal(folderMove, true)

    const partialUpdate = customValidator(null, {
      ...updateArgs,
      req: { data: { someOtherField: 'value' }, t },
    } as typeof updateArgs)
    assert.equal(partialUpdate, true)

    const submittedEmpty = customValidator('', {
      ...updateArgs,
      req: { data: { alt: '' }, t },
    } as typeof updateArgs)
    assert.equal(submittedEmpty, '@jhb.software/payload-alt-text-plugin:theAlternateTextIsRequired')

    const submittedFilled = customValidator('A sunset', {
      ...updateArgs,
      req: { data: { alt: 'A sunset' }, t },
    } as typeof updateArgs)
    assert.equal(submittedFilled, true)
  })
})
