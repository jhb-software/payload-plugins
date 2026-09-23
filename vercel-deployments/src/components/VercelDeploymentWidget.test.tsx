import type { I18nClient } from '@payloadcms/translations'
import type { PayloadRequest } from 'payload'
import type { MockInstance } from 'vitest'

import { prerender } from 'react-dom/static'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { translations } from '../translations/index.js'

// Next.js and @payloadcms/ui can't be hosted here (router context, CSS imports), so the
// client components the card renders get minimal stand-ins.
vi.mock('next/navigation.js', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@payloadcms/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  toast: {},
  useConfig: () => ({ config: { routes: { api: '/api' }, serverURL: '' } }),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@payloadcms/ui/elements/Pill', () => ({
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

const { VercelDeploymentWidget } = await import('./VercelDeploymentWidget.js')

/** Translates with the plugin's bundled English strings. */
const i18n = {
  dateFNSKey: 'en-US',
  language: 'en',
  t: (key: string) => {
    const [namespace, name] = key.split(':')
    const group = translations.en[namespace] as Record<string, string>
    return group[name] ?? key
  },
} as unknown as I18nClient

const basePluginConfig: VercelDeploymentsPluginConfig = {
  deploymentTarget: { projectId: 'test-project', websiteUrl: 'https://example.com' },
  vercel: { apiToken: 'test-token' },
}

function createReq({
  pluginConfig,
  user,
}: {
  pluginConfig: VercelDeploymentsPluginConfig
  user: { id: string } | null
}) {
  return {
    i18n,
    payload: { config: { custom: { vercelDeploymentsPluginConfig: pluginConfig } } },
    user,
  } as unknown as PayloadRequest
}

/** Renders the widget like the dashboard does, waiting for its suspended parts. */
async function renderWidget(req: PayloadRequest): Promise<string> {
  const { prelude } = await prerender(
    await VercelDeploymentWidget({ req } as Parameters<typeof VercelDeploymentWidget>[0]),
  )
  return new Response(prelude).text()
}

let fetchSpy: MockInstance<typeof fetch>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      deployments: [
        {
          created: Date.parse('2024-01-01T00:00:00Z'),
          inspectorUrl: 'https://vercel.com/inspect/dpl-1',
          ready: Date.parse('2024-01-01T00:01:00Z'),
          state: 'READY',
          uid: 'dpl-1',
        },
      ],
      pagination: { count: 1 },
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('VercelDeploymentWidget', () => {
  it('shows the deployment status to a user the access function allows', async () => {
    const html = await renderWidget(
      createReq({ pluginConfig: { ...basePluginConfig, access: () => true }, user: { id: '1' } }),
    )

    expect(fetchSpy).toHaveBeenCalled()
    expect(html).toContain('https://vercel.com/inspect/dpl-1')
    expect(html).toContain('example.com')
  })

  it('does not reveal deployments or offer a redeploy to a user the access function denies', async () => {
    const html = await renderWidget(
      createReq({ pluginConfig: { ...basePluginConfig, access: () => false }, user: { id: '1' } }),
    )

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(html).not.toContain('https://vercel.com/inspect/dpl-1')
    expect(html).not.toContain('example.com')
    expect(html).not.toContain('deploymentInfoTriggerRedeploy')
    expect(html).toContain('You do not have permission to view deployments.')
  })

  it('does not reveal deployments to a request without a user under the default access', async () => {
    const html = await renderWidget(createReq({ pluginConfig: basePluginConfig, user: null }))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(html).not.toContain('https://vercel.com/inspect/dpl-1')
  })
})
