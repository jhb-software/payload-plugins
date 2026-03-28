import type { PayloadHandler, PayloadRequest } from 'payload'

import { getAltTextHealth } from '../utilities/altTextHealth.js'

export const altTextHealthEndpoint: PayloadHandler = async (req: PayloadRequest) => {
  if (!req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const health = await getAltTextHealth(req)

  return Response.json(health)
}
