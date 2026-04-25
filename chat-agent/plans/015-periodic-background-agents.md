---
title: Periodic background agents
description: Declare cron-scheduled agents in plugin config (e.g. "every Monday at 9am, audit SEO metadata") that run unattended via `runAgent`, persist every execution into an admin-visible `agent-runs` collection, and reuse Payload's jobs queue for triggering, retries, and worker lifecycle.
type: feature
readiness: ready
---

> **Sequencing.** Depends on plan [014](./014-headless-agent-runner.md) (`runAgent`). Plan [017](./017-detached-agent-runs.md) (detached interactive runs) reuses the `agent-runs` collection and `chat-agent:run:<slug>` task family introduced here.

## Problem

The chat agent runs only on user-initiated HTTP turns. There is no way to declare _"every Monday at 9am, audit SEO metadata and fix low-quality entries"_ in plugin config, no way to inspect what an unattended run did, and no convention for who the agent acts as when no logged-in user is present.

Concrete motivating use cases:

- **Weekly SEO audit.** Scan all published pages, find low-quality `meta.title` / `meta.description` entries, propose fixes (or apply them in `read-write` mode), record findings.
- **Stale-content sweep.** Flag pages with `updatedAt` older than N months that still appear in primary navigation.
- **Translation top-up.** When a primary-locale page has no secondary-locale translation, queue a translation pass via the `content-translator` plugin.
- **On-call digest.** Once a day, produce a Slack-ready summary of what changed in the CMS in the last 24 hours.

All of these need three things the chat endpoint does not provide: a cron trigger, a service-account run model, and an admin UI for reviewing what happened.

## Proposal

Five concrete pieces, layered on plan 014's `runAgent`:

### 1. `scheduledAgents` plugin option

```ts
type ScheduledAgentContext = {
  payload: Payload
  now: Date
}

export interface ScheduledAgent {
  /** Unique within the plugin. Used to derive the task slug `chat-agent:run:<slug>`. */
  slug: string

  /** Admin-visible name. Defaults to `slug`. */
  label?: string

  /**
   * Prompt sent as the user message to `runAgent`. Function form lets the prompt
   * vary per run (include "this week's date", look up a config doc, etc.).
   */
  prompt: string | ((ctx: ScheduledAgentContext) => Promise<string> | string)

  /**
   * Mirrors Payload's `task.schedule` shape — a cron string, a `{ cron, queue? }`
   * object, or an array of those for multi-cadence agents.
   */
  schedule:
    | string
    | { cron: string; queue?: string }
    | Array<string | { cron: string; queue?: string }>

  /** Defaults to `'read-write'`. `'ask'` is rejected at construction (no human to confirm). */
  mode?: Exclude<AgentMode, 'ask'>

  /** Defaults to the plugin's `defaultModel`. Validated against `availableModels` if supplied. */
  model?: string

  /** Per-run step cap. Defaults to 50 (vs. 20 for interactive). */
  maxSteps?: number

  /** Hard wall-clock cap. Defaults to 10 minutes. The handler aborts via `AbortSignal`. */
  timeoutMs?: number
}

export interface ChatAgentPluginOptions {
  // …existing options…
  scheduledAgents?: ScheduledAgent[]
}
```

**Construction-time validation** (throws so misconfiguration fails fast):

- `slug` is unique across `scheduledAgents` and not colliding with any reserved/existing `payload-jobs` task slug.
- `slug` matches `/^[a-z0-9][a-z0-9-]*$/` (so the derived task slug stays URL-safe).
- `mode !== 'ask'` (no confirmation channel for unattended runs).
- `model`, when supplied, exists in `availableModels` (or is the configured `defaultModel` when `availableModels` is unset).
- `schedule` cron strings parse cleanly (use the same parser Payload's jobs system uses; surface a clear error pointing at the offending entry).

### 2. Config transform injects one task per agent

The plugin's existing config transform appends one entry per `scheduledAgent` to `config.jobs.tasks`:

```ts
{
  slug: `chat-agent:run:${agent.slug}`,
  schedule: normalizeSchedule(agent.schedule),
  queue: 'chat-agent', // overridable per-agent via the `{ cron, queue }` shape
  retries: 0,           // cost-safety; documented in the README
  inputSchema: [],      // cron-driven; no input
  handler: buildScheduledAgentHandler(agent, pluginOptions),
}
```

Properties:

- **Existing user tasks are preserved**, not replaced — the transform `concat`s rather than overwriting `config.jobs.tasks`.
- **`retries: 0` is the deliberate default**: re-running an agent that wrote part of an audit doubles the token bill and risks duplicate edits in `read-write` mode. Consumers can override per-agent if their workload is genuinely idempotent.
- **`queue: 'chat-agent'` keeps scheduled agents on a dedicated queue** so an operator can pause/drain just the agent traffic without affecting unrelated jobs.

`onInit` warns when `scheduledAgents.length > 0` and neither `config.jobs.autoRun` nor a discoverable jobs run endpoint is configured — silent no-ops here are the worst possible UX. The warning includes a one-line fix hint pointing at Payload's autoRun docs.

### 3. `agent-runs` collection

Admin-visible under the existing "Chat" group, read-only for non-admins. One document per execution.

```ts
{
  slug: 'agent-runs',
  admin: { group: 'Chat', useAsTitle: 'label', defaultColumns: ['label', 'status', 'startedAt', 'finishedAt'] },
  access: {
    read: ({ req }) => req.user?.role === 'admin', // tighten per consumer's auth model
    create: () => false,
    update: () => false,
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'slug',       type: 'text',     index: true, required: true },
    { name: 'label',      type: 'text' },                    // denormalised for list view
    { name: 'status',     type: 'select',   options: ['running', 'succeeded', 'failed', 'aborted'], required: true },
    { name: 'prompt',     type: 'textarea', required: true }, // exact prompt sent
    { name: 'mode',       type: 'select',   options: AGENT_MODES },
    { name: 'model',      type: 'text' },
    { name: 'messages',   type: 'json' },                     // assistant + tool messages, same shape as agent-conversations.messages
    { name: 'usage',      type: 'group',    fields: [
      { name: 'inputTokens',  type: 'number' },
      { name: 'outputTokens', type: 'number' },
      { name: 'totalTokens',  type: 'number' },
    ]},
    { name: 'error',      type: 'textarea' },                 // populated on failure
    { name: 'startedAt',  type: 'date',     required: true },
    { name: 'finishedAt', type: 'date' },
    { name: 'jobId',      type: 'text',     index: true },    // backref to payload-jobs.id
  ],
}
```

No client-supplied data lands here, so no `beforeValidate` hook to scrub user input. All writes happen via the task handler running with `overrideAccess: true`.

### 4. Task handler

`buildScheduledAgentHandler(agent, pluginOptions)` returns a Payload task handler with this synchronous flow:

```ts
;async ({ job, req }) => {
  const startedAt = new Date()
  const run = await req.payload.create({
    collection: 'agent-runs',
    overrideAccess: true,
    data: {
      slug: agent.slug,
      label: agent.label ?? agent.slug,
      status: 'running',
      mode: agent.mode ?? 'read-write',
      model: agent.model,
      startedAt,
      jobId: job.id,
      prompt: '', // populated below once resolved
    },
  })

  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), agent.timeoutMs ?? 10 * 60_000)

  try {
    const prompt =
      typeof agent.prompt === 'function'
        ? await agent.prompt({ payload: req.payload, now: startedAt })
        : agent.prompt
    await req.payload.update({
      collection: 'agent-runs',
      id: run.id,
      data: { prompt },
      overrideAccess: true,
    })

    const messages: unknown[] = []

    const result = await runAgent({
      payload: req.payload,
      user: null,
      overrideAccess: true,
      skipBudget: true,
      mode: agent.mode ?? 'read-write',
      model: agent.model,
      maxSteps: agent.maxSteps ?? 50,
      messages: prompt,
      abortSignal: ac.signal,
    })

    for await (const chunk of result.fullStream) {
      messages.push(chunk) // appended verbatim; finalised on succeeded
    }

    // `result.totalUsage` resolves once `fullStream` drains. Awaiting it inside
    // the same try block means a mid-stream abort still surfaces (the promise
    // rejects) and the catch records `aborted`/`failed` without overwriting
    // partial usage with `{}`.
    const usage = await result.totalUsage

    await req.payload.update({
      collection: 'agent-runs',
      id: run.id,
      overrideAccess: true,
      data: { status: 'succeeded', messages, usage, finishedAt: new Date() },
    })
    return { status: 'success' as const }
  } catch (err) {
    const aborted = ac.signal.aborted
    await req.payload.update({
      collection: 'agent-runs',
      id: run.id,
      overrideAccess: true,
      data: {
        status: aborted ? 'aborted' : 'failed',
        error:
          err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err),
        finishedAt: new Date(),
      },
    })
    throw err // let payload-jobs record the failure and apply the (default 0) retry policy
  } finally {
    clearTimeout(timeout)
  }
}
```

Auth invariant: the handler **always** passes `overrideAccess: true`, even for `mode: 'read-write'` runs. There is no logged-in user to attribute access checks to; the schedule itself is the authorisation.

### 5. Manual trigger documentation

No new HTTP endpoint for the MVP. Document the one-liner consumers already have:

```ts
await payload.jobs.queue({ task: 'chat-agent:run:seo-audit' })
```

A UI button in the `agent-runs` list view ("Run now") is a follow-up, gated behind admin access and rate-limited to "no other run for this slug currently `running`".

## Non-goals

- **Schedule editor UI.** Schedules live in code (the `scheduledAgents` config option). Editing them in the admin UI requires reconciling DB state with config state — a real design problem we defer until someone asks.
- **Per-tenant schedules.** Multi-tenant schedule scoping is a separate plan; today, schedules are global to the Payload instance.
- **Mid-run cancellation from admin.** No "stop" button. Add when the first user reports a runaway run.
- **Streaming progress to admin in real time.** The run is reviewable after it finishes. Live streaming converges with plan 017 (detached agent runs) and is best built once, there.
- **Custom budgets per scheduled agent.** Scheduled runs go through `runAgent({ skipBudget: true })`. Cost tracking is the consumer's billing system's job until a real need surfaces.

## Deliberately deferred

Each item below has a noted trigger event so we know when to revisit:

- **Per-slug concurrency lock.** Revisit when the first user reports "Monday 9am run was still going at 9:01 and the next tick stacked up". The simplest fix is a `running`-doc check in the handler that no-ops if one already exists, but it adds a pre-`runAgent` query to every tick.
- **Stop button.** Revisit when the first user wants to abort a runaway run. Implementation hangs off the `AbortController` already in the handler — the missing piece is a control-plane channel (DB flag polled by the handler, or a payload-jobs cancellation signal once that lands upstream).
- **`createScheduledAgent({ … })` builder.** Revisit if validation gets gnarlier than what an inline Zod schema covers. Plain object literals work fine for the MVP.

## Tool resolution and req

Scheduled-agent runs invoke `runAgent` without an HTTP `req`. Per plan 014's "Tool resolution order", that means:

- The plugin's `options.tools` factory is called with the synthetic minimal `req` (`{ payload, user: null, payloadAPI: 'local', headers: new Headers() }`). User-defined tools that only read `req.payload` keep working; tools that genuinely need cookies or middleware-attached state must guard or be filtered out by the consumer's factory when `req.payloadAPI === 'local'`.
- `buildTools`' custom-endpoint branch is skipped (no real `req` to forward), and the system prompt is built with `hasCustomEndpoints: false` so the agent isn't told about tools that aren't in its toolset.

If a consumer needs a specific tool subset for a scheduled agent only (e.g. read-only audits that should not see write tools), they wrap the per-call tool factory inside the agent's task handler — but for the MVP the per-mode filtering driven by `mode` is enough.

## Dev app demonstration

`chat-agent/dev/` ships a working scheduled agent so reviewers can see the full loop without scaffolding their own:

- Add one entry to the dev plugin invocation (`dev/src/payload.config.ts`) under `scheduledAgents` — e.g. `{ slug: 'pages-audit', label: 'Pages audit (dev)', schedule: '*/5 * * * *', mode: 'read', prompt: 'List all posts in the dev DB and report which ones lack a title.' }`. Cadence picked tight (5 min) so a reviewer can watch a real run land in the admin within a session.
- Enable Payload's `jobs.autoRun` in the dev config (or document the `payload jobs:run` CLI invocation in `dev/README.md`) so the cron actually fires.
- Seed one or two `posts` docs missing a title in the dev DB so the run produces a non-empty audit and exercises tool calls.
- Verify the resulting `agent-runs` doc shows up under "Chat → Agent Runs" in the admin with `status: succeeded`, populated `messages`, and non-zero `usage`.
- Add a Manual-trigger button or doc in `dev/README.md` showing `pnpm --filter chat-agent-dev jobs:queue pages-audit` (or equivalent) so reviewers can fire a run on demand instead of waiting for the cron tick.

## Test plan

- **Plugin config validation.** Duplicate slugs throw at construction; `mode: 'ask'` throws; unknown model throws; invalid cron throws with the offending entry's slug in the message.
- **Config transform.** Plugin output's `jobs.tasks` contains one task per scheduled agent with the expected `slug`, `schedule`, and `queue`. Existing user-declared tasks in `config.jobs.tasks` are preserved (assert reference identity for an unrelated user task).
- **Handler success path.** Stub `runAgent` to emit two text deltas and a tool call. Assert the `agent-runs` doc transitions `running` → `succeeded`, `messages` contains both deltas + the tool call, `usage` matches what the stub reported via `onUsage`, and `jobId` matches the synthetic job's id.
- **Handler failure path.** Stub `runAgent` to throw. Assert the doc is `failed` with `error` populated, `finishedAt` set, and the handler re-throws so payload-jobs records the failure (probe via the returned promise).
- **Timeout path.** `runAgent` takes longer than `timeoutMs`. Assert the controller aborts, the doc is `aborted` (not `failed`), and the abort propagates through `runAgent`'s `abortSignal`.
- **Auth invariant.** Even with `mode: 'read-write'`, the handler passes `overrideAccess: true` to `runAgent`. Spy on the call and assert.
- **`onInit` warning.** Scheduled agents declared but no `jobs.autoRun` configured → `payload.logger.warn` is called with an actionable message naming the affected slugs.
- **Manual queue.** `payload.jobs.queue({ task: 'chat-agent:run:<slug>' })` invokes the same handler with no input and creates an `agent-runs` doc just like a cron tick does.
- **Prompt function form.** `prompt: ({ now }) => …` is awaited and the resolved string is what gets written to `agent-runs.prompt` (not the function source).

## Related work

- Plan [014](./014-headless-agent-runner.md) — provides the `runAgent` primitive this plan invokes from every scheduled task handler.
- Plan [017](./017-detached-agent-runs.md) — reuses the `agent-runs` collection and `chat-agent:run:<slug>` task family introduced here for user-initiated detached runs.
