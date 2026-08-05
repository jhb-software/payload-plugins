import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getBreadcrumbs } from '../src/utils/getBreadcrumbs.js'

describe('getBreadcrumbs (client path)', () => {
  let recordedUrl: string | undefined

  beforeEach(() => {
    recordedUrl = undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        recordedUrl = typeof input === 'string' ? input : input.toString()
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              breadcrumbs: [{ label: 'Root', path: '/root', slug: 'root' }],
              id: 'parent-1',
            }),
          ok: true,
          statusText: 'OK',
        } as Response)
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('fetches the parent via the provided apiURL', async () => {
    await getBreadcrumbs({
      apiURL: '/api',
      breadcrumbLabelField: 'title',
      data: { id: 'child-1', parent: 'parent-1', slug: 'child', title: 'Child' },
      locale: undefined,
      locales: undefined,
      parentCollection: 'pages',
      parentField: 'parent',
      req: undefined,
    })

    expect(recordedUrl).toBeDefined()
    expect(recordedUrl).toMatch(/^\/api\/pages\/parent-1/)
  })

  test('respects a user-customized routes.api baked into apiURL', async () => {
    await getBreadcrumbs({
      apiURL: 'https://cms.example.com/custom-api',
      breadcrumbLabelField: 'title',
      data: { id: 'child-1', parent: 'parent-1', slug: 'child', title: 'Child' },
      locale: undefined,
      locales: undefined,
      parentCollection: 'pages',
      parentField: 'parent',
      req: undefined,
    })

    expect(recordedUrl).toBeDefined()
    expect(recordedUrl).toMatch(/^https:\/\/cms\.example\.com\/custom-api\/pages\/parent-1/)
  })

  test('throws a clear error when called without req and without apiURL', async () => {
    await expect(() =>
      getBreadcrumbs({
        breadcrumbLabelField: 'title',
        data: { id: 'child-1', parent: 'parent-1', slug: 'child', title: 'Child' },
        locale: undefined,
        locales: undefined,
        parentCollection: 'pages',
        parentField: 'parent',
        req: undefined,
      }),
    ).rejects.toThrow(/requires `apiURL` when called without `req`/)
  })
})
