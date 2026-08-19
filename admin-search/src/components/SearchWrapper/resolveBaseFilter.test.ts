import type { Payload, PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import type { AdminSearchPluginConfig } from '../../types/AdminSearchPluginConfig.js'

import { resolveBaseFilter } from './resolveBaseFilter.js'

const payloadWith = (pluginConfig?: AdminSearchPluginConfig, logged: unknown[] = []) =>
  ({
    config: { custom: pluginConfig ? { adminSearchPluginConfig: pluginConfig } : {} },
    logger: { error: (...args: unknown[]) => logged.push(args) },
  }) as unknown as Payload

/**
 * Stands in for the request Payload renders the admin panel with. Only the parts a filter
 * reads are modelled: the incoming cookies, the signed-in user and the resolved locale.
 */
const requestWith = (
  parts: { cookie?: string; locale?: string; user?: { id: string } } = {},
): PayloadRequest =>
  ({
    headers: new Headers(parts.cookie ? { cookie: parts.cookie } : {}),
    locale: parts.locale,
    user: parts.user,
  }) as unknown as PayloadRequest

describe('resolveBaseFilter', () => {
  it('leaves the search unscoped when no base filter is configured', async () => {
    await expect(
      resolveBaseFilter({ payload: payloadWith({}), req: requestWith() }),
    ).resolves.toBeUndefined()
  })

  it('scopes by the tenant cookie the admin panel was requested with', async () => {
    const filter = await resolveBaseFilter({
      payload: payloadWith({
        baseFilter: ({ req }) => ({
          tenant: { equals: req.headers.get('cookie')?.split('payload-tenant=')[1] },
        }),
      }),
      req: requestWith({ cookie: 'payload-tenant=acme' }),
    })

    expect(filter).toEqual({ tenant: { equals: 'acme' } })
  })

  it('scopes by the signed-in user', async () => {
    const filter = await resolveBaseFilter({
      payload: payloadWith({ baseFilter: ({ req }) => ({ owner: { equals: req.user?.id } }) }),
      req: requestWith({ user: { id: 'user-1' } }),
    })

    expect(filter).toEqual({ owner: { equals: 'user-1' } })
  })

  it('gives the filter the locale the admin panel is being viewed in, not the default one', async () => {
    const filter = await resolveBaseFilter({
      payload: payloadWith({ baseFilter: ({ req }) => ({ language: { equals: req.locale } }) }),
      req: requestWith({ locale: 'de' }),
    })

    expect(filter).toEqual({ language: { equals: 'de' } })
  })

  it('falls back to an unscoped search when the filter throws, instead of failing the render', async () => {
    const logged: unknown[] = []

    await expect(
      resolveBaseFilter({
        payload: payloadWith(
          {
            baseFilter: () => {
              throw new Error('tenant cookie was malformed')
            },
          },
          logged,
        ),
        req: requestWith(),
      }),
    ).resolves.toBeUndefined()

    expect(logged).toHaveLength(1)
  })

  it('falls back to an unscoped search when an async filter rejects', async () => {
    await expect(
      resolveBaseFilter({
        payload: payloadWith({ baseFilter: () => Promise.reject(new Error('db unreachable')) }),
        req: requestWith(),
      }),
    ).resolves.toBeUndefined()
  })

  it('reports a configured filter that could not run because no request was passed', async () => {
    const logged: unknown[] = []

    await expect(
      resolveBaseFilter({
        payload: payloadWith({ baseFilter: () => ({ tenant: { equals: 'acme' } }) }, logged),
        req: undefined,
      }),
    ).resolves.toBeUndefined()

    expect(logged).toHaveLength(1)
  })

  it('stays quiet when no request is passed and no filter is configured', async () => {
    const logged: unknown[] = []

    await resolveBaseFilter({ payload: payloadWith({}, logged), req: undefined })

    expect(logged).toHaveLength(0)
  })
})
