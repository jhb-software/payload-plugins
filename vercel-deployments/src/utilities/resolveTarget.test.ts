import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { resolveTarget } from './resolveTarget.js'

const req = { headers: new Headers() } as PayloadRequest

describe('resolveTarget', () => {
  it('passes static configuration through unchanged', async () => {
    const pluginConfig: VercelDeploymentsPluginConfig = {
      vercel: { apiToken: 'token', projectId: 'prj_static' },
      widget: { websiteUrl: 'https://example.com' },
    }

    await expect(resolveTarget({ pluginConfig, req })).resolves.toEqual({
      projectId: 'prj_static',
      websiteUrl: 'https://example.com',
    })
  })

  it('resolves the project and website of the request when they are configured as functions', async () => {
    const pluginConfig: VercelDeploymentsPluginConfig = {
      vercel: {
        apiToken: 'token',
        projectId: ({ req }) => `prj_${req.headers.get('x-tenant')}`,
      },
      widget: {
        websiteUrl: ({ req }) =>
          Promise.resolve(`https://${req.headers.get('x-tenant')}.example.com`),
      },
    }

    const target = await resolveTarget({
      pluginConfig,
      req: { headers: new Headers({ 'x-tenant': 'acme' }) } as PayloadRequest,
    })

    expect(target).toEqual({
      projectId: 'prj_acme',
      websiteUrl: 'https://acme.example.com',
    })
  })

  it('reports no target when the resolver finds no project for the request', async () => {
    const pluginConfig: VercelDeploymentsPluginConfig = {
      vercel: { apiToken: 'token', projectId: () => undefined },
    }

    await expect(resolveTarget({ pluginConfig, req })).resolves.toEqual({
      projectId: undefined,
      websiteUrl: undefined,
    })
  })
})
