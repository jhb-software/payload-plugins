import { describe, expect, it } from 'vitest'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { vercelDeploymentsPlugin } from '../plugin.js'

const basePluginConfig: VercelDeploymentsPluginConfig = {
  vercel: {
    apiToken: 'test-token',
    projectId: 'test-project',
    teamId: 'test-team',
  },
}

const basePayloadConfig = {
  admin: {},
  collections: [],
} as any

describe('vercelDeploymentsPlugin', () => {
  it('returns config unchanged when plugin is disabled', () => {
    const plugin = vercelDeploymentsPlugin({ ...basePluginConfig, enabled: false })
    const result = plugin(basePayloadConfig)
    expect(result).toEqual(basePayloadConfig)
  })

  it('registers the dashboard widget', () => {
    const plugin = vercelDeploymentsPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    expect(result.admin?.dashboard?.widgets).toHaveLength(1)
    const widget = result.admin?.dashboard?.widgets?.[0] as Record<string, unknown>
    expect(widget).toMatchObject({
      slug: 'vercel-deployments',
      Component: '@jhb.software/payload-vercel-deployments/client#VercelDeploymentWidget',
    })
    // ComponentPath is set for backward compatibility with Payload < 3.79.0
    expect(widget.ComponentPath).toBe(
      '@jhb.software/payload-vercel-deployments/client#VercelDeploymentWidget',
    )
  })

  it('registers two API endpoints', () => {
    const plugin = vercelDeploymentsPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    expect(result.endpoints).toHaveLength(2)
  })

  it('registers correct HTTP methods for endpoints', () => {
    const plugin = vercelDeploymentsPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    const endpoints = result.endpoints!
    const getEndpoint = endpoints.find(
      (e: any) => e.path === '/vercel-deployments' && e.method === 'get',
    )
    const postEndpoint = endpoints.find(
      (e: any) => e.path === '/vercel-deployments' && e.method === 'post',
    )

    expect(getEndpoint).toBeDefined()
    expect(postEndpoint).toBeDefined()
  })

  it('stores plugin config in custom for endpoint handlers', () => {
    const plugin = vercelDeploymentsPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    expect(result.custom?.vercelDeploymentsPluginConfig).toEqual(basePluginConfig)
  })

  it('registers translations', () => {
    const plugin = vercelDeploymentsPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    expect(result.i18n?.translations).toBeDefined()
    expect((result.i18n?.translations as any)?.en?.['vercel-dashboard']).toBeDefined()
    expect((result.i18n?.translations as any)?.de?.['vercel-dashboard']).toBeDefined()
  })

  it('preserves existing widgets', () => {
    const existingWidget = { slug: 'existing', Component: 'SomeComponent' }
    const configWithWidgets = {
      ...basePayloadConfig,
      admin: { dashboard: { widgets: [existingWidget] } },
    }

    const plugin = vercelDeploymentsPlugin(basePluginConfig)
    const result = plugin(configWithWidgets)

    expect(result.admin?.dashboard?.widgets).toHaveLength(2)
    expect(result.admin?.dashboard?.widgets?.[0]).toEqual(existingWidget)
  })

  it('preserves existing endpoints', () => {
    const existingEndpoint = { handler: () => {}, method: 'get', path: '/existing' }
    const configWithEndpoints = {
      ...basePayloadConfig,
      endpoints: [existingEndpoint],
    }

    const plugin = vercelDeploymentsPlugin(basePluginConfig)
    const result = plugin(configWithEndpoints)

    expect(result.endpoints).toHaveLength(3)
    expect(result.endpoints![0]).toEqual(existingEndpoint)
  })

  it('applies custom widget dimensions', () => {
    const plugin = vercelDeploymentsPlugin({
      ...basePluginConfig,
      widget: { maxWidth: 'large', minWidth: 'small' },
    })
    const result = plugin(basePayloadConfig)

    expect(result.admin?.dashboard?.widgets?.[0]).toMatchObject({
      maxWidth: 'large',
      minWidth: 'small',
    })
  })
})
