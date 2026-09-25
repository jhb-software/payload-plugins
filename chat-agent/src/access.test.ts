import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { isPluginAccessAllowed } from './access.js'

/** A request as Payload builds it: `admin.user` names the admin panel's auth collection. */
const requestFrom = (user: { collection: string; id: number | string } | null) =>
  ({ payload: { config: { admin: { user: 'users' } } }, user }) as unknown as PayloadRequest

describe('isPluginAccessAllowed without an access option', () => {
  it('allows users of the admin user collection', async () => {
    expect(await isPluginAccessAllowed(requestFrom({ id: 5, collection: 'users' }))).toBe(true)
  })

  it('denies users of other auth collections, such as site customers', async () => {
    expect(await isPluginAccessAllowed(requestFrom({ id: 5, collection: 'customers' }))).toBe(false)
  })

  it('denies anonymous requests', async () => {
    expect(await isPluginAccessAllowed(requestFrom(null))).toBe(false)
  })
})
