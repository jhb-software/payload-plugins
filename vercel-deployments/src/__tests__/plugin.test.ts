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
    expect(result.admin?.dashboard?.widgets?.[0]).toMatchObject({
      slug: 'vercel-deployments',
      Component: '@jhb.software/payload-vercel-deployments/client#VercelDeploymentWidget',
    })
  })

  it('registers three API endpoints', () => {
    const plugin = vercelDeploymentsPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    expect(result.endpoints).toHaveLength(3)

    const paths = result.endpoints!.map((e: any) => e.path)
    expect(paths).toContain('/vercel-deployments')
    expect(paths).toContain('/vercel-deployments/status')
    expect(paths).toContain('/vercel-deployments')
  })

  it('registers correct HTTP methods for endpoints', () => {
    const plugin = vercelDeploymentsPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    const endpointMap = Object.fromEntries(
      result.endpoints!.map((e: any) => [e.path, e.method]),
    )
    const endpoints = result.endpoints!
    const listEndpoint = endpoints.find((e: any) => e.path === '/vercel-deployments' && e.method === 'get')
    const statusEndpoint = endpoints.find((e: any) => e.path === '/vercel-deployments/status')
    const triggerEndpoint = endpoints.find((e: any) => e.path === '/vercel-deployments' && e.method === 'post')

    expect(listEndpoint).toBeDefined()
    expect(statusEndpoint?.method).toBe('get')
    expect(triggerEndpoint).toBeDefined()
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

    expect(result.endpoints).toHaveLength(4)
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
