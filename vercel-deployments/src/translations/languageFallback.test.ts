import type { Config } from 'payload'

import { initI18n } from '@payloadcms/translations'
import { ru } from '@payloadcms/translations/languages/ru'
import { describe, expect, it } from 'vitest'

import { vercelDeploymentsPlugin } from '../plugin.js'

// The plugin ships English and German strings only. Payload resolves a key against the
// active admin language alone, so without a fallback every other language rendered the raw
// key ("vercel-dashboard:deploymentInfoActiveDeployment") in the admin UI.

describe('admin languages without bundled plugin strings', () => {
  it('resolves a plugin key to the English string instead of the raw key', async () => {
    const config = vercelDeploymentsPlugin({
      deploymentTarget: { projectId: 'test-project' },
      vercel: { apiToken: 'test-token', teamId: 'test-team' },
    })({ admin: {}, collections: [], i18n: { supportedLanguages: { ru } } } as unknown as Config)

    const i18n = await initI18n({
      config: config.i18n as never,
      context: 'client',
      language: 'ru' as never,
    })

    expect(i18n.t('vercel-dashboard:deploymentInfoActiveDeployment' as never)).toBe(
      'Active Deployment',
    )
  })
})
