import type { PayloadRequest } from 'payload'

import type { AltTextPluginConfig } from '../../src/types/AltTextPluginConfig.ts'

/**
 * Shared fixtures for the alt-text endpoint tests. Every endpoint test needs the
 * same two things: a resolved plugin config exposed on `req.payload.config.custom`
 * and a fake `PayloadRequest` whose `findByID`/`update` Local API calls are
 * recorded so the test can assert how the endpoint invoked them. Centralizing them
 * here keeps each test focused on the one behavior it protects.
 */

export const testUser = { id: 'low-priv-user', email: 'user@example.com', role: 'user' }

export type LocalApiCall = Record<string, unknown>

/**
 * A resolved plugin config with sensible defaults for an `image/*` `media`
 * collection. Pass `overrides` to vary the single facet a test cares about
 * (e.g. `locales`, `maxBulkGenerateIds`, or a recording `resolver`).
 */
export function buildPluginConfig(
  overrides: Partial<AltTextPluginConfig> = {},
): AltTextPluginConfig {
  return {
    access: ({ req }) => !!req.user,
    collections: [{ slug: 'media', mimeTypes: ['image/*'] }],
    enabled: true,
    getImageThumbnail: () => 'https://example.com/thumb.png',
    healthCheck: true,
    healthCheckAccess: ({ req }) => !!req.user,
    locale: 'en',
    locales: [],
    maxBulkGenerateConcurrency: 1,
    maxBulkGenerateIds: 100,
    resolver: {
      key: 'mock',
      resolve: async () => ({
        success: true,
        result: { altText: 'generated alt', keywords: ['a', 'b'] },
      }),
      resolveBulk: async () => ({
        success: true,
        results: { en: { altText: 'generated alt', keywords: ['a', 'b'] } },
      }),
    },
    ...overrides,
  }
}

/**
 * Builds a fake `PayloadRequest` for an endpoint handler. `findByID` returns a
 * minimal image document by default; pass `pluginConfig` to use a config other
 * than the shared default. The returned `findByIDCalls`/`updateCalls` arrays
 * record the arguments of every Local API call the endpoint makes.
 */
export function buildEndpointRequest(
  body: unknown,
  options: { pluginConfig?: AltTextPluginConfig } = {},
): {
  findByIDCalls: LocalApiCall[]
  req: PayloadRequest
  updateCalls: LocalApiCall[]
} {
  const findByIDCalls: LocalApiCall[] = []
  const updateCalls: LocalApiCall[] = []
  const pluginConfig = options.pluginConfig ?? buildPluginConfig()

  const req = {
    json: async () => body,
    payload: {
      config: { custom: { altTextPluginConfig: pluginConfig } },
      findByID: async (args: LocalApiCall) => {
        findByIDCalls.push(args)
        return { id: args.id, filename: 'photo.png', mimeType: 'image/png' }
      },
      update: async (args: LocalApiCall) => {
        updateCalls.push(args)
        return { id: args.id }
      },
    },
    user: testUser,
  } as unknown as PayloadRequest

  return { findByIDCalls, req, updateCalls }
}
