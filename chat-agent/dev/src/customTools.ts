import type { PayloadRequest } from 'payload'

import { tool } from 'ai'
import { z } from 'zod'

/**
 * Example `customTools` for the dev app.
 *
 * These tools are executed by the agent via the Vercel AI SDK — they don't
 * route through Payload's HTTP layer, so they fit well for calls into
 * external services (log backends, webhooks, third-party APIs).
 *
 * Each tool degrades gracefully when the relevant env var is missing so the
 * dev app remains runnable without configuring every integration.
 */
export function customTools({ req }: { req: PayloadRequest }) {
  return {
    // -------------------------------------------------------------------------
    // Axiom Logs
    // -------------------------------------------------------------------------
    // Queries a dataset via Axiom's APL endpoint. Docs:
    //   https://axiom.co/docs/restapi/endpoints/queryApl
    //
    // Requires:
    //   AXIOM_API_TOKEN          — Personal API token with "query" permission
    //   AXIOM_DATASET (optional) — Default dataset name; the agent can override
    queryAxiomLogs: tool({
      description:
        'Query logs from Axiom (https://axiom.co) using APL. Pass a dataset name and an APL query string. Returns the matching events (capped by `limit`, default 25).',
      inputSchema: z.object({
        apl: z
          .string()
          .describe(
            "APL query, e.g. `['my-dataset'] | where status >= 500 | summarize count() by bin(_time, 5m)`",
          ),
        dataset: z
          .string()
          .optional()
          .describe('Axiom dataset name. Defaults to the `AXIOM_DATASET` env var.'),
        limit: z.number().optional().describe('Max events to return (default 25)'),
      }),
      execute: async ({ apl, dataset, limit }, { abortSignal }) => {
        const token = process.env.AXIOM_API_TOKEN
        if (!token) {
          return { error: 'AXIOM_API_TOKEN is not set on the server' }
        }
        const ds = dataset ?? process.env.AXIOM_DATASET
        if (!ds) {
          return { error: 'No dataset provided and AXIOM_DATASET is not set' }
        }
        const res = await fetch('https://api.axiom.co/v1/datasets/_apl?format=tabular', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ apl: `['${ds}'] | ${apl}` }),
          signal: abortSignal,
        })
        if (!res.ok) {
          return { error: `Axiom API returned ${res.status}`, body: await res.text() }
        }
        const data = (await res.json()) as { matches?: unknown[] }
        const matches = data.matches ?? []
        return { matches: matches.slice(0, limit ?? 25), total: matches.length }
      },
    }),

    // -------------------------------------------------------------------------
    // Vercel Logs (Runtime Logs via the Observability API)
    // -------------------------------------------------------------------------
    // Docs: https://vercel.com/docs/observability/runtime-logs
    //
    // Requires:
    //   VERCEL_API_TOKEN  — Access token
    //   VERCEL_PROJECT_ID — Project whose logs to query
    //   VERCEL_TEAM_ID    — Optional; required for team-owned projects
    queryVercelLogs: tool({
      description:
        'Fetch recent runtime logs from Vercel for the configured project. Optionally filter by log level (`error`, `warning`, `info`). Returns the most recent `limit` entries.',
      inputSchema: z.object({
        level: z.enum(['error', 'warning', 'info']).optional().describe('Filter by log level'),
        limit: z.number().optional().describe('Max entries to return (default 50)'),
      }),
      execute: async ({ level, limit }, { abortSignal }) => {
        const token = process.env.VERCEL_API_TOKEN
        const projectId = process.env.VERCEL_PROJECT_ID
        if (!token || !projectId) {
          return { error: 'VERCEL_API_TOKEN or VERCEL_PROJECT_ID is not set on the server' }
        }
        const params = new URLSearchParams({ projectId, limit: String(limit ?? 50) })
        if (level) {
          params.set('level', level)
        }
        if (process.env.VERCEL_TEAM_ID) {
          params.set('teamId', process.env.VERCEL_TEAM_ID)
        }
        const res = await fetch(`https://api.vercel.com/v1/observability/logs?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortSignal,
        })
        if (!res.ok) {
          return { error: `Vercel API returned ${res.status}`, body: await res.text() }
        }
        return (await res.json()) as unknown
      },
    }),

    // -------------------------------------------------------------------------
    // Slack — send message to a channel via Incoming Webhook
    // -------------------------------------------------------------------------
    // Docs: https://api.slack.com/messaging/webhooks
    //
    // Requires:
    //   SLACK_WEBHOOK_URL — Incoming webhook URL for the target channel
    sendSlackMessage: tool({
      description:
        'Post a message to the Slack channel configured by `SLACK_WEBHOOK_URL`. Use for operational notifications (deploys, incidents, approvals). The sender identity is set by the server.',
      inputSchema: z.object({
        text: z.string().describe('Message text. Slack mrkdwn is supported.'),
      }),
      execute: async ({ text }, { abortSignal }) => {
        const url = process.env.SLACK_WEBHOOK_URL
        if (!url) {
          return { error: 'SLACK_WEBHOOK_URL is not set on the server' }
        }
        // The sender identity is server-controlled; the agent only supplies the body.
        // Service accounts (used by headless cron callers) have no email — label
        // them by their account name instead so the audit trail stays useful.
        const sender =
          req.user?.collection === 'service-accounts'
            ? `service:${req.user.name ?? req.user.id}`
            : (req.user?.email ?? 'unknown-user')
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `*[${sender}]* ${text}` }),
          signal: abortSignal,
        })
        return { ok: res.ok, status: res.status }
      },
    }),
  }
}
