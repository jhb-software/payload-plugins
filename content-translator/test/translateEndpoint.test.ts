import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { translateEndpoint } from '../src/translate/endpoint.ts'

/**
 * These tests protect the REST write path used by programmatic/agent callers:
 * `POST /api/translator/translate` only persists the translation when the
 * request opts in with `update: true`, and the `draft` flag controls whether
 * the write lands as a draft. Writes must always run with `overrideAccess:
 * false` so the requesting user's collection access still gates the mutation.
 */

const allowAll = () => true

type UpdateCall = Record<string, unknown>

function buildReq(body: unknown): {
  findByIDCalls: UpdateCall[]
  req: PayloadRequest
  updateCalls: UpdateCall[]
} {
  const findByIDCalls: UpdateCall[] = []
  const updateCalls: UpdateCall[] = []

  const resolver = {
    key: 'mock',
    resolve: async ({ texts }: { texts: string[] }) => ({
      success: true as const,
      translatedTexts: texts.map((text) => `de:${text}`),
    }),
  }

  const config = {
    collections: [
      {
        slug: 'posts',
        fields: [{ name: 'title', type: 'text', localized: true }],
      },
    ],
    custom: { translator: { resolver } },
    globals: [],
  }

  const req = {
    json: async () => body,
    payload: {
      config,
      findByID: async (args: UpdateCall) => {
        findByIDCalls.push(args)
        return { id: 'post-1', title: 'Hello' }
      },
      logger: { error: () => {} },
      update: async (args: UpdateCall) => {
        updateCalls.push(args)
        return { id: args.id }
      },
    },
    user: { id: 'agent', email: 'agent@example.com' },
  } as unknown as PayloadRequest

  return { findByIDCalls, req, updateCalls }
}

const baseBody = {
  collectionSlug: 'posts',
  data: { title: 'Hello' },
  id: 'post-1',
  locale: 'de',
  localeFrom: 'en',
}

describe('translate endpoint persistence', () => {
  test('does not write the document when update is omitted', async () => {
    const { req, updateCalls } = buildReq({ ...baseBody })

    const response = await translateEndpoint(allowAll)(req)
    const result = await response.json()

    assert.equal(updateCalls.length, 0)
    assert.equal(result.success, true)
    assert.equal(result.translatedData.title, 'de:Hello')
  })

  test('persists the translation at the target locale when update is true', async () => {
    const { req, updateCalls } = buildReq({ ...baseBody, update: true })

    await translateEndpoint(allowAll)(req)

    assert.equal(updateCalls.length, 1)
    assert.equal(updateCalls[0].id, 'post-1')
    assert.equal(updateCalls[0].collection, 'posts')
    assert.equal(updateCalls[0].locale, 'de')
    assert.equal((updateCalls[0].data as Record<string, unknown>).title, 'de:Hello')
  })

  test('writes under the requesting user, never with overridden access', async () => {
    const { req, updateCalls } = buildReq({ ...baseBody, update: true })

    await translateEndpoint(allowAll)(req)

    assert.equal(updateCalls[0].overrideAccess, false)
  })

  test('saves as a published version by default', async () => {
    const { req, updateCalls } = buildReq({ ...baseBody, update: true })

    await translateEndpoint(allowAll)(req)

    assert.notEqual(updateCalls[0].draft, true)
  })

  test('saves as a draft when draft is true', async () => {
    const { req, updateCalls } = buildReq({ ...baseBody, draft: true, update: true })

    await translateEndpoint(allowAll)(req)

    assert.equal(updateCalls[0].draft, true)
  })
})

describe('translate endpoint access control', () => {
  test('ignores overrideAccess in the request body so access cannot be bypassed', async () => {
    const { req, updateCalls } = buildReq({ ...baseBody, overrideAccess: true, update: true })

    await translateEndpoint(allowAll)(req)

    assert.equal(updateCalls.length, 1)
    assert.equal(updateCalls[0].overrideAccess, false)
  })

  test('lets the access function allow return-only but deny persisting', async () => {
    const returnOnly = ({ update }: { update?: boolean }) => !update

    // update: true is denied and nothing is written
    const denied = buildReq({ ...baseBody, update: true })
    await assert.rejects(
      () => translateEndpoint(returnOnly)(denied.req),
      (err) => err instanceof APIError && err.status === 401,
    )
    assert.equal(denied.updateCalls.length, 0)

    // the same caller may still translate-and-return
    const allowed = buildReq({ ...baseBody })
    const response = await translateEndpoint(returnOnly)(allowed.req)
    const result = await response.json()
    assert.equal(result.success, true)
    assert.equal(allowed.updateCalls.length, 0)
  })

  test('passes the parsed request args to the access function', async () => {
    let received: Record<string, unknown> | undefined
    const capture = (args: Record<string, unknown>) => {
      received = args
      return true
    }

    const { req } = buildReq({ ...baseBody, draft: true, update: true })

    await translateEndpoint(capture)(req)

    assert.equal(received?.update, true)
    assert.equal(received?.draft, true)
    assert.equal(received?.collectionSlug, 'posts')
    assert.ok(received?.req)
  })

  test('reads the source document with overrideAccess false so source access is enforced', async () => {
    // baseBody supplies `data`, so only the source (localeFrom) read happens
    const { findByIDCalls, req } = buildReq({ ...baseBody })

    await translateEndpoint(allowAll)(req)

    assert.equal(findByIDCalls.length, 1)
    assert.equal(findByIDCalls[0].overrideAccess, false)
  })

  test('reads source and target with overrideAccess false when data is not supplied', async () => {
    const { findByIDCalls, req } = buildReq({
      collectionSlug: 'posts',
      id: 'post-1',
      locale: 'de',
      localeFrom: 'en',
    })

    await translateEndpoint(allowAll)(req)

    assert.equal(findByIDCalls.length, 2)
    for (const call of findByIDCalls) {
      assert.equal(call.overrideAccess, false)
    }
  })

  test('returns 400 when the request body is not valid JSON', async () => {
    const { req } = buildReq(undefined)
    req.json = async () => {
      throw new SyntaxError('Unexpected token')
    }

    await assert.rejects(
      () => translateEndpoint(allowAll)(req),
      (err) => err instanceof APIError && err.status === 400,
    )
  })
})
