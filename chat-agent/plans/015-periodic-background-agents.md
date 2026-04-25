---
title: Periodic background agents
description: Declare cron-scheduled agents in plugin config (e.g. "every Monday at 9am, audit SEO metadata") that run unattended via `runAgent(req, opts)`, persist every execution into an admin-visible `agent-runs` collection, and reuse Payload's jobs queue for triggering, retries, and worker lifecycle.
type: feature
readiness: ready
---

> **Sequencing.** Builds on the shipped `runAgent(req, opts)` primitive. Plan [017](./017-detached-agent-runs.md) (detached interactive runs) reuses the `agent-runs` collection and `chat-agent:run:<slug>` task family introduced here.

## Problem

The chat agent runs only on user-initiated HTTP turns. There is no way to declare _"every Monday at 9am, audit SEO metadata and fix low-quality entries"_ in plugin config, no way to inspect what an unattended run did, and no convention for who the agent acts as when no logged-in user is present.

Concrete motivating use cases:

- **Weekly SEO audit.** Scan all published pages, find low-quality `meta.title` / `meta.description` entries, propose fixes (or apply them in `read-write` mode), record findings.
- **Stale-content sweep.** Flag pages with `updatedAt` older than N months that still appear in primary navigation.
- **Translation top-up.** When a primary-locale page has no secondary-locale translation, queue a translation pass via the `content-translator` plugin.
- **On-call digest.** Once a day, produce a Slack-ready summary of what changed in the CMS in the last 24 hours.

All of these need three things the chat endpoint does not provide: a cron trigger, a service-account run model, and an admin UI for reviewing what happened.

## Proposal

Five concrete pieces, layered on the shipped `runAgent(req, opts)` primitive:

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

  /**
   * Reference to the user the agent acts as — required. The handler resolves
   * it via `payload.findByID` once per run, builds a per-run request via
   * `createLocalReq({ user }, payload)`, and passes that to `runAgent`. The
   * agent then operates with that user's standard Payload access — same
   * gating as if the user were chatting interactively.
   *
   * `collection` is typed as Payload's `CollectionSlug` so consumers get
   * autocomplete on their actual auth-enabled collection slugs from
   * generated types.
   *
   * Use a service-account user (`auth: { useAPIKey: true }`) with the
   * permissions the agent actually needs to bound the blast radius via
   * Payload's existing access control. There is no "no actor" mode in the
   * MVP: every run is auditable to a specific identity. If the agent
   * needs to escape access checks (e.g. cross-collection audits), set
   * `mode: 'superuser'` and the handler will pass `overrideAccess: true`
   * to `runAgent`.
   *
   * Example: an SEO-audit agent runs as a `role: 'seo-bot'` user whose
   * collection access permits `read` + `update` on `pages` only. The
   * agent in `mode: 'read-write'` then literally cannot touch any other
   * collection, regardless of what its prompt asks for.
   */
  user: { collection: CollectionSlug; id: number | string }
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
- `schedule` cron strings: pass them through to Payload's jobs system as-is (Payload accepts cron strings on `task.schedule` and validates them itself). The plugin does **not** bundle a separate cron parser; if Payload rejects the string at task-registration time, surface that error with the offending agent's slug for context. No new dependency.
- `user.collection` exists in `config.collections` and is auth-enabled. Validation happens at construction (so a typo in the collection slug or pointing at a non-auth collection fails at boot, not at the first cron tick). The user document itself is looked up at run time — if it has been deleted by then, the run fails with a clear `not found` error.

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

`onInit` warns when `scheduledAgents.length > 0` and neither `config.jobs.autoRun` nor a discoverable jobs run endpoint is configured — silent no-ops here are the worst possible UX. The warning includes a one-line fix hint pointing at Payload's autoRun docs, and lists the affected slugs.

If any scheduled agent overrides `queue` to a non-default value, the warning also names that queue: per-queue worker configuration is the consumer's responsibility, and a missed queue config means agents on that queue silently never run.

**Default concurrent-tick behaviour.** Two cron ticks for the same agent that overlap (e.g. a Monday 9:00 audit still running at 9:01 when a `* 9 * * 1` cadence fires again — pathological but possible) will create **two parallel `agent-runs` docs**. Whether they run in parallel or are serialized depends on the queue's worker concurrency, which is Payload's concern. The MVP does not add a per-slug "skip if already running" lock; that's a deferred decision (see "Deliberately deferred" below).

### 3. `agent-runs` collection

Admin-visible under the existing "Chat" group, read-only for non-admins. One document per execution.

```ts
{
  slug: 'agent-runs',
  admin: { group: 'Chat', useAsTitle: 'label', defaultColumns: ['label', 'status', 'startedAt', 'finishedAt'] },
  access: {
    read:   ({ req }) => isPluginAccessAllowed(req),  // same gate as the chat endpoint; consumer's `options.access` flows through
    create: () => false,                              // only the task handler writes (with overrideAccess: true)
    update: () => false,
    delete: ({ req }) => isPluginAccessAllowed(req),  // editors who can see runs can also clean them up
  },
  fields: [
    { name: 'slug',       type: 'text',     index: true, required: true },
    { name: 'label',      type: 'text' },                    // denormalised for list view
    { name: 'status',     type: 'select',   options: ['running', 'succeeded', 'failed', 'aborted'], required: true },
    { name: 'prompt',     type: 'textarea', required: true }, // exact prompt sent
    { name: 'mode',       type: 'select',   options: AGENT_MODES },
    { name: 'model',      type: 'text' },
    { name: 'messages',   type: 'json' },                     // ModelMessage[] from streamText's result.response.messages on success; empty array on failure (use the `error` field for diagnostics)
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

**Access policy.** The collection reuses `isPluginAccessAllowed` from `src/access.ts:16` — the same gate the chat endpoint, the conversations collection, and the modes endpoint already use. One access concept across the plugin: anyone authorized to use the chat agent can also read the audit trail of what the agent did headlessly. Consumers configure access in **one** place (the existing `chatAgentPlugin({ access })` option); both interactive and scheduled surfaces inherit it.

If a consumer needs different visibility for chat vs. audits — e.g. editors can chat but only admins should see scheduled-run history — the escape hatch is post-merge mutation of the collection's `access.read`. We do **not** add a separate `agentRunsAccess` plugin option for the MVP; revisit when a real consumer asks for it.

When plan 017 lands and `agent-runs` docs gain a `triggeredBy.userId` (for user-initiated detached runs), the `read` callback gets refined to admit the run's submitter even if they wouldn't pass `isPluginAccessAllowed` — that's a plan-017 schema-additive change, not a plan-015 concern.

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

    // Resolve the configured user. The agent runs under that user's standard
    // Payload access — same gating as if the user were chatting
    // interactively. We construct a per-run req via `createLocalReq` so
    // `runAgent`'s "req carries the actor" contract holds without
    // mutating the task handler's shared `req`.
    const user = await req.payload.findByID({
      collection: agent.user.collection,
      id: agent.user.id,
      overrideAccess: true,
    })
    const runReq = await createLocalReq({ user }, req.payload)

    const result = await runAgent(runReq, {
      // `mode: 'superuser'` requires `overrideAccess: true`; for any other
      // mode the agent operates within the configured user's normal access.
      overrideAccess: agent.mode === 'superuser',
      skipBudget: true,
      mode: agent.mode ?? 'read-write',
      model: agent.model,
      maxSteps: agent.maxSteps ?? 50,
      messages: prompt,
      abortSignal: ac.signal,
    })

    // Drain the stream so the run actually progresses; we don't store the
    // chunks themselves — `result.response` gives us the assembled
    // `ModelMessage[]` once the run finishes.
    for await (const _ of result.fullStream) {
      /* discard */
    }

    // Both Promises resolve once `fullStream` drains. Awaiting them inside
    // the same try block means a mid-stream abort still surfaces (they
    // reject) and the catch records `aborted`/`failed` without leaving the
    // doc in `running`.
    const [response, usage] = await Promise.all([result.response, result.totalUsage])

    await req.payload.update({
      collection: 'agent-runs',
      id: run.id,
      overrideAccess: true,
      data: {
        status: 'succeeded',
        messages: response.messages, // ModelMessage[] — what the LLM actually emitted
        usage,
        finishedAt: new Date(),
      },
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
        messages: [], // empty on failure; see `error` for diagnostics
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

Auth model: every run has an actor. The handler resolves `agent.user` to a real user document, builds a per-run `req` via `createLocalReq({ user }, payload)`, and passes that to `runAgent`. The agent's blast radius is whatever the configured user can do via Payload's normal access rules. There is no separate per-collection allowlist in the plugin; you bound the agent by giving its `user` only the permissions it should have. For audits that genuinely need to escape access checks (cross-collection reads, admin-style maintenance), set `agent.mode: 'superuser'` and the handler will pass `overrideAccess: true` — explicit and visible at the schedule's declaration site.

`messages` shape: persisted as `ModelMessage[]` from `result.response.messages` — the AI SDK's canonical "what the LLM emitted" record. On failure or abort, `messages` is `[]` and the failure detail lives in the `error` field. Plan 017's tail/resume use case requires incremental writes (the worker writes mid-run; the browser tails them); when 017 lands it adds either a `chunks: json` field that's appended to during the run, or an incremental flush of `messages` every N steps. Either is a schema-additive change to this collection.

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

## Implementation notes

- **File layout.** New files: `src/scheduled-agents.ts` (config validation + transform that injects tasks into `config.jobs.tasks`), `src/agent-runs.ts` (the collection definition), `src/scheduled-agent-handler.ts` (the `buildScheduledAgentHandler` factory). The plugin's existing `src/index.ts` imports and wires them.
- **`label` is captured at run-creation time, not retroactively.** If a consumer renames `agent.label` in config, existing `agent-runs` docs keep their old label. This is intentional — the audit collection is a historical record, not a config mirror. Document this in the field's admin description.
- **Prompt function-form context.** `ScheduledAgentContext = { payload, now }` is deliberately minimal. Not exposed: the full `pluginOptions` (consumers already know what they configured), `req` (no HTTP request exists), `pastRuns` (consumers can `payload.find({ collection: 'agent-runs', where: { slug: { equals: agent.slug } } })` themselves). Add to context only when a real consumer hits a wall.
- **Prompt resolution order.** The function form runs **before** `agent-runs.prompt` is updated, so the persisted `prompt` is exactly what `runAgent` sees. If the resolver throws, the run transitions to `failed` with the resolver's error captured.

## Tool resolution and req

Scheduled-agent runs invoke `runAgent` with the per-run `req` constructed via `createLocalReq({ user }, payload)`. That carries `req.payload`, `req.user` (the resolved configured user), and Payload's standard middleware-attached fields, so:

- The plugin's `options.tools` factory receives a real `req` — user-defined tools that read `req.user`, `req.payload`, or locale work the same way they do in the chat endpoint.
- `buildTools`' custom-endpoint branch wires `callEndpoint` normally, and the system prompt is built with `hasCustomEndpoints: true` when the config has any.

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
- **Handler success path.** Stub `runAgent` to return a result whose `response.messages` is a known `ModelMessage[]` (one assistant message containing a text part and a tool call) and whose `totalUsage` is a known token total. Assert the `agent-runs` doc transitions `running` → `succeeded`, `messages` deep-equals `response.messages`, `usage` matches `totalUsage`, and `jobId` matches the synthetic job's id.
- **Handler failure path: messages emptied.** On thrown / aborted runs, assert `messages` is persisted as `[]` (not `undefined`, not the in-flight chunks) and the `error` field carries the diagnostic.
- **Handler failure path.** Stub `runAgent` to throw. Assert the doc is `failed` with `error` populated, `finishedAt` set, and the handler re-throws so payload-jobs records the failure (probe via the returned promise).
- **Timeout path.** `runAgent` takes longer than `timeoutMs`. Assert the controller aborts, the doc is `aborted` (not `failed`), and the abort propagates through `runAgent`'s `abortSignal`.
- **Auth — configured user.** Configure `user: { collection: 'users', id: <id> }` for a seeded user with limited access. Handler looks up that user, builds the per-run req via `createLocalReq`, and the spy on `runAgent` sees the req's `user` matching the seeded one with `overrideAccess: false`. Integration-test that a tool call attempting to read a collection the user can't see returns a Payload access error inside `messages` (not a successful read).
- **Auth — user missing.** When `user` references a deleted document, the handler surfaces a clear `not found` error and the run is `failed` with `error` populated.
- **Auth — superuser mode.** With `mode: 'superuser'`, the handler still resolves `user` (the actor is preserved for audit) but passes `overrideAccess: true` to `runAgent`. Spy and assert.
- **Access reuse — denied.** Configure `chatAgentPlugin({ access: () => false })`. Assert `payload.find({ collection: 'agent-runs' })` from a request that hits the gate returns no docs (and the REST endpoint returns 401). Confirms `isPluginAccessAllowed` flows through to the new collection.
- **Access reuse — default.** With no `options.access` configured, an authenticated `req.user` can read; an anonymous request cannot. Confirms the helper's fallback applies.
- **`onInit` warning.** Scheduled agents declared but no `jobs.autoRun` configured → `payload.logger.warn` is called with an actionable message naming the affected slugs.
- **Manual queue.** `payload.jobs.queue({ task: 'chat-agent:run:<slug>' })` invokes the same handler with no input and creates an `agent-runs` doc just like a cron tick does.
- **Prompt function form.** `prompt: ({ now }) => …` is awaited and the resolved string is what gets written to `agent-runs.prompt` (not the function source).

## Related work

- The `runAgent(req, opts)` primitive this plan invokes from every scheduled task handler ships in the chat-agent plugin's main entry.
- Plan [017](./017-detached-agent-runs.md) — reuses the `agent-runs` collection and `chat-agent:run:<slug>` task family introduced here for user-initiated detached runs.
