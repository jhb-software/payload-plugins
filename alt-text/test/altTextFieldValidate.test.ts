import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { validateAltText } from '../src/utilities/mimeTypes.ts'

const createdAt = '2024-01-01T00:00:00.000Z'
const updatedAt = '2024-01-02T00:00:00.000Z'

const t = (key: string) => key

const regularUpdateMeta = {
  data: { createdAt, updatedAt },
  operation: 'update',
  req: { data: { alt: '' } as Record<string, unknown>, t },
}

describe('validateAltText', () => {
  test('rejects a regular update for a tracked image mime type with an empty alt text', () => {
    const result = validateAltText(
      '',
      {
        ...regularUpdateMeta,
        data: { ...regularUpdateMeta.data, mimeType: 'image/png' },
      },
      ['image/*'],
    )

    assert.equal(result, '@jhb.software/payload-alt-text-plugin:theAlternateTextIsRequired')
  })

  test('allows an empty alt text for a document whose mime type is not tracked', () => {
    const result = validateAltText(
      '',
      {
        ...regularUpdateMeta,
        data: { ...regularUpdateMeta.data, mimeType: 'video/mp4' },
      },
      ['image/*'],
    )

    assert.equal(result, true)
  })

  test('accepts a filled alt text for a tracked image mime type', () => {
    const result = validateAltText(
      'A descriptive alt text',
      {
        ...regularUpdateMeta,
        data: { ...regularUpdateMeta.data, mimeType: 'image/png' },
        req: { data: { alt: 'A descriptive alt text' }, t },
      },
      ['image/*'],
    )

    assert.equal(result, true)
  })

  test('requires alt text regardless of mime type when no trackedMimeTypes are configured', () => {
    const result = validateAltText('', {
      ...regularUpdateMeta,
      data: { ...regularUpdateMeta.data, mimeType: 'video/mp4' },
    })

    assert.equal(result, '@jhb.software/payload-alt-text-plugin:theAlternateTextIsRequired')
  })

  test('allows an empty alt text on the initial upload regardless of mime type', () => {
    const result = validateAltText(
      '',
      {
        data: { createdAt, updatedAt: createdAt, mimeType: 'image/png' },
        operation: 'update',
        req: { data: { alt: '' }, t },
      },
      ['image/*'],
    )

    assert.equal(result, true)
  })

  test('allows an empty alt text when the document has no mime type (non-upload rows)', () => {
    const result = validateAltText(
      '',
      {
        ...regularUpdateMeta,
      },
      ['image/*'],
    )

    assert.equal(result, true)
  })

  // https://github.com/jhb-software/payload-plugins/issues/95
  test('skips validation when alt is not in the request body (folder move, partial update)', () => {
    const result = validateAltText(
      null,
      {
        ...regularUpdateMeta,
        data: { ...regularUpdateMeta.data, mimeType: 'image/png' },
        req: { data: { folder: 'folder-id' }, t },
      },
      ['image/*'],
    )

    assert.equal(result, true)
  })

  test('skips validation when the request has no body at all', () => {
    const result = validateAltText(
      null,
      {
        ...regularUpdateMeta,
        data: { ...regularUpdateMeta.data, mimeType: 'image/png' },
        req: { t },
      },
      ['image/*'],
    )

    assert.equal(result, true)
  })

  test('rejects null submitted via API (clearing alt)', () => {
    const result = validateAltText(
      null,
      {
        ...regularUpdateMeta,
        data: { ...regularUpdateMeta.data, mimeType: 'image/png' },
        req: { data: { alt: null }, t },
      },
      ['image/*'],
    )

    assert.equal(typeof result, 'string')
  })

  test('rejects whitespace-only alt when alt is submitted', () => {
    const result = validateAltText(
      '   ',
      {
        ...regularUpdateMeta,
        data: { ...regularUpdateMeta.data, mimeType: 'image/png' },
        req: { data: { alt: '   ' }, t },
      },
      ['image/*'],
    )

    assert.equal(typeof result, 'string')
  })
})
