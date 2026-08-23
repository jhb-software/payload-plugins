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
    ).resolves.toEqual({ status: 'resolved' })
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

    expect(filter).toEqual({ filter: { tenant: { equals: 'acme' } }, status: 'resolved' })
  })

  it('scopes by the signed-in user', async () => {
    const filter = await resolveBaseFilter({
      payload: payloadWith({ baseFilter: ({ req }) => ({ owner: { equals: req.user?.id } }) }),
      req: requestWith({ user: { id: 'user-1' } }),
    })

    expect(filter).toEqual({ filter: { owner: { equals: 'user-1' } }, status: 'resolved' })
  })

  it('gives the filter the locale the admin panel is being viewed in, not the default one', async () => {
    const filter = await resolveBaseFilter({
      payload: payloadWith({ baseFilter: ({ req }) => ({ language: { equals: req.locale } }) }),
      req: requestWith({ locale: 'de' }),
    })

    expect(filter).toEqual({ filter: { language: { equals: 'de' } }, status: 'resolved' })
  })

  it('matches nothing when the filter throws, rather than widening to documents the filter would have hidden', async () => {
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
    ).resolves.toEqual({ status: 'unavailable' })

    expect(logged).toHaveLength(1)
  })

  it('matches nothing when an async filter rejects', async () => {
    await expect(
      resolveBaseFilter({
        payload: payloadWith({ baseFilter: () => Promise.reject(new Error('db unreachable')) }),
        req: requestWith(),
      }),
    ).resolves.toEqual({ status: 'unavailable' })
  })

  it('matches nothing when a filter is configured but no request was passed to evaluate it with', async () => {
    const logged: unknown[] = []

    await expect(
      resolveBaseFilter({
        payload: payloadWith({ baseFilter: () => ({ tenant: { equals: 'acme' } }) }, logged),
        req: undefined,
      }),
    ).resolves.toEqual({ status: 'unavailable' })

    expect(logged).toHaveLength(1)
  })

  it('stays quiet when no request is passed and no filter is configured', async () => {
    const logged: unknown[] = []

    await expect(
      resolveBaseFilter({ payload: payloadWith({}, logged), req: undefined }),
    ).resolves.toEqual({ status: 'resolved' })

    expect(logged).toHaveLength(0)
  })
})
