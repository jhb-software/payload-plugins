import type { I18nClient } from '@payloadcms/translations'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { VercelDeploymentsPluginConfig } from '../types.js'

import { translations } from '../translations/index.js'

// Both pull in CSS that vitest can't load.
vi.mock('@payloadcms/ui', () => ({ useConfig: () => ({ config: {} }) }))
vi.mock('@payloadcms/ui/elements/Pill', () => ({ Pill: () => null }))

const { default: DeploymentInfo } = await import('./DeploymentInfoCard.js')

/** Translates with the plugin's bundled English strings. */
const i18n = {
  language: 'en',
  t: (key: string) => {
    const [namespace, name] = key.split(':')
    const group = translations.en[namespace] as Record<string, string>
    return group[name] ?? key
  },
} as unknown as I18nClient

const pluginConfig: VercelDeploymentsPluginConfig = {
  deploymentTarget: { projectId: undefined },
  vercel: { apiToken: 'token' },
}

describe('DeploymentInfo', () => {
  it('shows a translated hint when the request has no deployment target', async () => {
    const html = renderToStaticMarkup(
      await DeploymentInfo({ i18n, pluginConfig, target: { projectId: undefined } }),
    )

    expect(html).toContain('No Vercel project selected.')
  })
})
