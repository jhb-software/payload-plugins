import { describe, expect, it } from 'vitest'

import type { VercelDashboardPluginConfig } from '../types.js'

import { vercelDashboardPlugin } from '../plugin.js'

const basePluginConfig: VercelDashboardPluginConfig = {
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

describe('vercelDashboardPlugin', () => {
  it('returns config unchanged when plugin is disabled', () => {
    const plugin = vercelDashboardPlugin({ ...basePluginConfig, enabled: false })
    const result = plugin(basePayloadConfig)
    expect(result).toEqual(basePayloadConfig)
  })

  it('registers the dashboard widget', () => {
    const plugin = vercelDashboardPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    expect(result.admin?.dashboard?.widgets).toHaveLength(1)
    expect(result.admin?.dashboard?.widgets?.[0]).toMatchObject({
      slug: 'vercel-deployments',
      Component: '@jhb.software/payload-vercel-dashboard-widget/client#VercelDeploymentWidget',
    })
  })

  it('registers three API endpoints', () => {
    const plugin = vercelDashboardPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    expect(result.endpoints).toHaveLength(3)

    const paths = result.endpoints!.map((e: any) => e.path)
    expect(paths).toContain('/vercel-dashboard/deployments-info')
    expect(paths).toContain('/vercel-dashboard/deployment-info')
    expect(paths).toContain('/vercel-dashboard/trigger-deployment')
  })

  it('registers correct HTTP methods for endpoints', () => {
    const plugin = vercelDashboardPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    const endpointMap = Object.fromEntries(
      result.endpoints!.map((e: any) => [e.path, e.method]),
    )
    expect(endpointMap['/vercel-dashboard/deployments-info']).toBe('get')
    expect(endpointMap['/vercel-dashboard/deployment-info']).toBe('get')
    expect(endpointMap['/vercel-dashboard/trigger-deployment']).toBe('post')
  })

  it('stores plugin config in custom for endpoint handlers', () => {
    const plugin = vercelDashboardPlugin(basePluginConfig)
    const result = plugin(basePayloadConfig)

    expect(result.custom?.vercelDashboardPluginConfig).toEqual(basePluginConfig)
  })

  it('registers translations', () => {
    const plugin = vercelDashboardPlugin(basePluginConfig)
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

    const plugin = vercelDashboardPlugin(basePluginConfig)
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

    const plugin = vercelDashboardPlugin(basePluginConfig)
    const result = plugin(configWithEndpoints)

    expect(result.endpoints).toHaveLength(4)
    expect(result.endpoints![0]).toEqual(existingEndpoint)
  })

  it('applies custom widget dimensions', () => {
    const plugin = vercelDashboardPlugin({
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
