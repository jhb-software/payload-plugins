/**
 * Headless `runAgent` demo for the dev app.
 *
 * Boots Payload's local API, then calls `runAgent` against the seeded dev
 * database with a one-shot prompt and prints the agent's text reply to stdout.
 *
 * Usage:
 *   pnpm --filter chat-agent-dev run:agent
 *   pnpm --filter chat-agent-dev run:agent "Your custom prompt"
 *
 * Two ways to run:
 *
 * 1. As a logged-in user (default):
 *    The script looks up the seeded `dev@payloadcms.com` admin user and
 *    passes it as `user`. Tools inherit that user's Payload permissions.
 *
 * 2. As a system / no-auth run (set `RUN_AS_SYSTEM=1`):
 *    `user: null` plus `overrideAccess: true`. Tools bypass Payload access
 *    control entirely — the right shape for a scheduled job that audits the
 *    whole dataset without a human caller.
 */

import { runAgent } from '@jhb.software/payload-chat-agent'
import { config as loadDotenv } from 'dotenv'
import { getPayload } from 'payload'

import config from '../payload.config.js'

loadDotenv()

async function main() {
  const prompt =
    process.argv[2] ??
    'List the three most recently updated posts. Reply with each title on its own line, no extra commentary.'

  const payload = await getPayload({ config })

  let user: { id: number | string } | null = null
  if (!process.env.RUN_AS_SYSTEM) {
    // Look up the seeded admin so the agent runs with that user's access.
    const result = await payload.find({
      collection: 'users',
      limit: 1,
      where: { email: { equals: 'dev@payloadcms.com' } },
    })
    user = result.docs[0] ? ({ id: result.docs[0].id } as { id: number | string }) : null
  }

  process.stderr.write(
    user
      ? `Running as user ${(user as { id: unknown }).id}…\n`
      : 'Running as system (overrideAccess: true)…\n',
  )

  const startedAt = Date.now()
  const result = await runAgent(payload, {
    maxSteps: 20,
    messages: prompt,
    mode: 'read',
    overrideAccess: user === null,
    skipBudget: true,
    user,
  })

  // Drain the stream to completion. `result.text` resolves to the final
  // assistant message; `result.totalUsage` resolves to the cumulative usage
  // across all steps.
  const text = await result.text
  const usage = await result.totalUsage

  process.stdout.write(`${text}\n`)
  process.stderr.write(
    `\n---\nElapsed: ${(Date.now() - startedAt) / 1000}s | tokens: ${usage.totalTokens ?? '?'}\n`,
  )

  // `getPayload` keeps a process-wide handle alive — exit explicitly so the
  // CLI doesn't hang on the open Mongo connection.
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`Headless agent run failed:\n${err instanceof Error ? err.stack : err}\n`)
  process.exit(1)
})
