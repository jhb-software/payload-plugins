import type { PayloadHandler, PayloadRequest } from 'payload'

import { ALT_TEXT_HEALTH_PLUGIN_SLUG, getAltTextHealth } from '../utilities/altTextHealth.js'

export const altTextHealthEndpoint: PayloadHandler = async (req: PayloadRequest) => {
  if (!req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const health = await getAltTextHealth(req)

    return Response.json(health)
  } catch (error) {
    req.payload.logger.error({
      err: error,
      msg: 'Failed to build alt text health response.',
      path: '/alt-text-plugin/health',
      plugin: ALT_TEXT_HEALTH_PLUGIN_SLUG,
    })

    return Response.json({ error: 'Failed to compute alt text health' }, { status: 500 })
  }
}
