import type { Payload } from 'payload'

import { describe, expect, it } from 'vitest'

import type { AdminSearchPluginConfig } from '../../types/AdminSearchPluginConfig.js'

import { resolveBaseFilter } from './resolveBaseFilter.js'

const payloadWith = (pluginConfig?: AdminSearchPluginConfig) =>
  ({
    config: {
      admin: { user: 'users' },
      custom: pluginConfig ? { adminSearchPluginConfig: pluginConfig } : {},
      i18n: { fallbackLanguage: 'en' },
    },
  }) as unknown as Payload

/** Stands in for the admin panel's i18n, which the resolver reuses instead of building one. */
const i18n = { language: 'en', t: (key: string) => key } as never

describe('resolveBaseFilter', () => {
  it('leaves the search unscoped when no base filter is configured', async () => {
    await expect(
      resolveBaseFilter({ headers: new Headers(), i18n, payload: payloadWith({}) }),
    ).resolves.toBeUndefined()
  })

  it('gives the filter a request carrying the incoming cookies, so it can scope by the selected tenant', async () => {
    const filter = await resolveBaseFilter({
      headers: new Headers({ cookie: 'payload-tenant=acme' }),
      i18n,
      payload: payloadWith({
        baseFilter: ({ req }) => ({
          tenant: { equals: req.headers.get('cookie')?.split('payload-tenant=')[1] },
        }),
      }),
    })

    expect(filter).toEqual({ tenant: { equals: 'acme' } })
  })

  it('gives the filter the signed-in user, so it can scope by who is searching', async () => {
    const filter = await resolveBaseFilter({
      headers: new Headers(),
      i18n,
      payload: payloadWith({ baseFilter: ({ req }) => ({ owner: { equals: req.user?.id } }) }),
      user: { id: 'user-1', collection: 'users' },
    })

    expect(filter).toEqual({ owner: { equals: 'user-1' } })
  })
})
