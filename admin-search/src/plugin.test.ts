import type { Config } from 'payload'

import { describe, expect, it } from 'vitest'

import { adminSearchPlugin } from './plugin.js'

/** A config skeleton; the plugin only reads `admin`, `custom` and `i18n` off it. */
const baseConfig = (config: Partial<Config> = {}) => ({ collections: [], ...config }) as Config

describe('adminSearchPlugin', () => {
  it('keeps the custom config other plugins put on the config, rather than replacing it', () => {
    const result = adminSearchPlugin({})(
      baseConfig({ custom: { someOtherPlugin: { setting: 'kept' } } }),
    )

    expect(result.custom?.someOtherPlugin).toEqual({ setting: 'kept' })
  })

  it('stores the options on the config, so the search server component can read the base filter back', () => {
    const baseFilter = () => ({ tenant: { equals: 'acme' } })

    const result = adminSearchPlugin({ baseFilter })(baseConfig())

    expect(result.custom?.adminSearchPluginConfig).toMatchObject({ baseFilter })
  })

  it('leaves the config untouched when the plugin is disabled', () => {
    const incoming = baseConfig({ custom: { someOtherPlugin: { setting: 'kept' } } })

    expect(adminSearchPlugin({ enabled: false })(incoming)).toBe(incoming)
  })

  it('appends the search action instead of dropping the actions already configured', () => {
    const result = adminSearchPlugin({})(
      baseConfig({ admin: { components: { actions: ['some/other#Action'] } } }),
    )

    expect(result.admin?.components?.actions).toEqual([
      'some/other#Action',
      expect.objectContaining({ path: '@jhb.software/payload-admin-search/rsc#SearchWrapper' }),
    ])
  })
})
