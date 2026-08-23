import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { resolveTarget } from './resolveTarget.js'

const req = { headers: new Headers() } as PayloadRequest

describe('resolveTarget', () => {
  it('passes a static target through unchanged', async () => {
    const pluginConfig: VercelDeploymentsPluginConfig = {
      deploymentTarget: { projectId: 'prj_static', websiteUrl: 'https://example.com' },
      vercel: { apiToken: 'token' },
    }

    await expect(resolveTarget({ pluginConfig, req })).resolves.toEqual({
      projectId: 'prj_static',
      websiteUrl: 'https://example.com',
    })
  })

  it('resolves the project and website of the request from a single lookup', async () => {
    const lookup = vi.fn((tenant: null | string) =>
      Promise.resolve({
        projectId: `prj_${tenant}`,
        websiteUrl: `https://${tenant}.example.com`,
      }),
    )
    const pluginConfig: VercelDeploymentsPluginConfig = {
      deploymentTarget: ({ req }) => lookup(req.headers.get('x-tenant')),
      vercel: { apiToken: 'token' },
    }

    const target = await resolveTarget({
      pluginConfig,
      req: { headers: new Headers({ 'x-tenant': 'acme' }) } as PayloadRequest,
    })

    expect(target).toEqual({
      projectId: 'prj_acme',
      websiteUrl: 'https://acme.example.com',
    })
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('reports no target when the resolver finds no project for the request', async () => {
    const pluginConfig: VercelDeploymentsPluginConfig = {
      deploymentTarget: () => ({ projectId: undefined }),
      vercel: { apiToken: 'token' },
    }

    await expect(resolveTarget({ pluginConfig, req })).resolves.toEqual({
      projectId: undefined,
    })
  })
})
