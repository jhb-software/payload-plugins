---
title: Headless agent runner
description: Extract the chat endpoint's orchestration into a reusable `runAgent` function so background jobs (cron, Payload jobs queue, webhooks) can invoke the agent off-HTTP — e.g. a weekly content audit — without holding an open connection to a browser client.
type: feature
readiness: ready
---

## Problem

The chat agent today runs only inside the `POST /chat-agent/chat` endpoint. Everything — auth, mode resolution, budget check, tool building, system prompt, model resolution, `streamText` wiring — lives in one handler and hangs off `req` (`src/index.ts:186-362`). The moment the client disconnects, `req.signal` fires and `streamText` aborts (verified by the `index.test.ts` case "cancels the provider call when the client disconnects mid-stream") — the right default for interactive chat, but it makes headless use impossible:

- No way to trigger an agent run from a Payload task, cron, webhook, or CLI script.
- No way to run an agent without a logged-in user (there is no client to authenticate).
- No way to consume the final result as a value instead of an SSE stream.

Concrete motivating use cases:

- **Weekly content audit** — scan all published pages, summarise stale/broken/duplicate content, file a report in a `content-reports` collection or send it to Slack.
- **On-publish enrichment** — when an editor publishes a blog post, run an agent pass that proposes an alt-text, a social-share blurb, and a category tag, storing them as suggested edits.
- **Scheduled data sync** — translate newly-created pages into a secondary locale overnight via the `content-translator` plugin's tool surface.
- **CLI debugging** — run the same agent against the local DB from a script to reproduce a production issue.

None of these have a client. They need a synchronous, awaitable function that reuses the exact tool/prompt/model machinery the chat endpoint uses.

## Proposal

Extract a single function — `runAgent` — that owns everything the chat endpoint currently does from "after validation" through "before `toUIMessageStreamResponse`". Both the HTTP handler and a Payload job/cron become thin wrappers.

### Public surface

`runAgent` is a single named export. It takes a `Payload` instance plus a per-call options bag and returns the raw `streamText` handle. Internally it looks up the plugin options the chat-agent plugin stashed on `payload.config.custom.chatAgent.pluginOptions` at config-build time.

```ts
// chat-agent/src/runAgent.ts
import type { ModelMessage, StreamTextResult, ToolSet, UIMessage } from 'ai'
import type { Payload, PayloadRequest } from 'payload'

import type { AgentMode, ChatAgentPluginOptions } from './types.js'

export interface RunAgentOptions {
  /**
   * The conversation so far. Accepts the same `UIMessage[]` shape the chat
   * endpoint takes (from the AI SDK `useChat`), a provider-ready
   * `ModelMessage[]`, or a single string prompt for the common one-shot case.
   */
  messages: ModelMessage[] | string | UIMessage[]

  /**
   * The user context the agent acts as. Pass the logged-in user for
   * interactive use, or a synthetic service-account user for background jobs.
   * The tools inherit this user's Payload access unless `overrideAccess` is
   * set.
   */
  user: null | { id: number | string; [key: string]: unknown }

  /**
   * Bypass Payload access control when executing tools. Defaults to `false`.
   * Background jobs typically want `true` so the agent can read/write across
   * the whole dataset. Required to run in mode `superuser`.
   */
  overrideAccess?: boolean

  /** Which mode to run in. Defaults to the plugin's default mode. */
  mode?: AgentMode

  /** Model id. Defaults to the plugin's `defaultModel`. */
  model?: string

  /**
   * Per-call step cap. Defaults to the plugin's `maxSteps`. Background jobs
   * generally want a tighter bound than interactive chat.
   */
  maxSteps?: number

  /**
   * Replace the derived system prompt entirely, or extend it. The function
   * form may be sync or async — async lets jobs fetch task-specific context
   * (config doc, last-week's report) before composing the final prompt.
   */
  systemPrompt?: string | ((basePrompt: string) => string | Promise<string>)

  /**
   * Filter or replace the tool set. `(base) => ToolSet` lets jobs run a
   * narrow slice (e.g. read-only) without touching plugin config. Defaults to
   * the plugin's per-mode tool selection.
   */
  tools?: ((baseTools: ToolSet) => ToolSet) | ToolSet

  /** Abort signal. Interactive callers pass `req.signal`; jobs omit it. */
  abortSignal?: AbortSignal

  /**
   * Skip the plugin's budget check/record hooks. Defaults to `false`. Set
   * `true` for service-account runs where per-user budgets don't apply.
   */
  skipBudget?: boolean

  /**
   * Forwarded to `buildTools` when tools need to call custom endpoints. The
   * HTTP handler passes `req`; background jobs can omit it (custom-endpoint
   * tools are skipped) or pass a real `req` if they have one. When omitted,
   * `runAgent` synthesises a minimal `req` (`{ payload, user, payloadAPI:
   * 'local', headers: new Headers() }`) and passes it to the plugin's
   * `options.tools` factory so user-defined tools that only need
   * `req.payload` keep working. Tools that genuinely need an HTTP `req`
   * (cookies, custom-endpoint handlers, locale negotiation) are
   * documented as "skipped on headless" and must guard their own
   * preconditions.
   */
  req?: PayloadRequest
}

/** Result mirrors `streamText`'s handle so callers choose how to consume it. */
export type RunAgentResult = StreamTextResult<ToolSet, never>

/**
 * Public entry point. Looks up the plugin options the chat-agent plugin stashed
 * on `payload.config.custom.chatAgent.pluginOptions` and runs the agent.
 * Throws if the plugin is not installed in the given Payload config.
 */
export function runAgent(payload: Payload, opts: RunAgentOptions): Promise<RunAgentResult>

/**
 * Internal — the actual orchestration. Exported for tests; not part of the
 * public package surface.
 */
export function runAgentImpl(
  pluginOptions: ChatAgentPluginOptions,
  payload: Payload,
  opts: RunAgentOptions,
): Promise<RunAgentResult>
```

Consumption patterns:

```ts
import { runAgent } from '@jhb.software/payload-chat-agent'

// 1. HTTP handler — today's chat endpoint becomes a thin wrapper.
const result = await runAgent(req.payload, {
  user: req.user,
  messages: body.messages,
  mode: body.mode,
  model: body.model,
  abortSignal: req.signal,
  req,
})
return result.toUIMessageStreamResponse({ headers, messageMetadata })

// 2. Background job — await to completion, read the final text.
const result = await runAgent(payload, {
  user: { id: 'system', email: 'agent@internal' },
  overrideAccess: true,
  mode: 'read',
  messages:
    'Audit all pages in the `pages` collection published in the last 7 days. List ones with fewer than 200 words or without a hero image.',
  maxSteps: 40,
  skipBudget: true,
})
const report = await result.text
await payload.create({ collection: 'content-reports', data: { body: report } })

// 3. One-shot tool-call — narrow the tool set explicitly.
const result = await runAgent(payload, {
  user,
  messages: prompt,
  tools: (base) => ({ find: base.find, findByID: base.findByID }),
})
```

### Wiring from the plugin

`runAgent` is the **only** public entry point. There is no `createAgentRunner` factory, no module augmentation, and no `config.custom`-based access path documented as public API.

The plugin's config transform stashes the raw `ChatAgentPluginOptions` on `config.custom.chatAgent.pluginOptions` at config-build time. The exported `runAgent(payload, opts)` reads them back at call time and forwards to `runAgentImpl`:

```ts
// chat-agent/src/runAgent.ts (sketch)
export async function runAgent(payload: Payload, opts: RunAgentOptions): Promise<RunAgentResult> {
  const stash = payload.config.custom?.chatAgent?.pluginOptions
  if (!stash) {
    throw new Error(
      '@jhb.software/payload-chat-agent: runAgent is not available. ' +
        'Did you install `chatAgentPlugin()` in your Payload config?',
    )
  }
  return runAgentImpl(stash, payload, opts)
}
```

Consumer side — no factory, no closure wrangling, no cast:

```ts
// e.g. a Payload task handler.
import { runAgent } from '@jhb.software/payload-chat-agent'

export const weeklyAudit: TaskHandler = async ({ req }) => {
  const result = await runAgent(req.payload, {
    user: null,
    overrideAccess: true,
    mode: 'read',
    messages: 'Produce a content audit…',
  })
  // …persist result.text somewhere.
}
```

The `pluginOptions` stash also unblocks plan 015's config-transform validation (it can read `pluginOptions.availableModels` to validate scheduled-agent `model` fields without a separate plumbing channel).

### What moves where

`src/index.ts:186-362` splits into:

1. `src/runAgent.ts` — exports `runAgent` (the public lookup wrapper) and `runAgentImpl` (mode resolution, budget check, tool discovery, tool filtering, system-prompt build, model resolution, `streamText` call). Pure — no `Response` / HTTP awareness.
2. `src/index.ts` handler — parses/validates the body, calls `runAgent(req.payload, …)`, wraps the result with `toUIMessageStreamResponse` and the budget headers.
3. `src/index.ts` config transform — adds `pluginOptions: options` to the existing `config.custom.chatAgent` block alongside `defaultModel`, `modesConfig`, etc.

No consumer-visible change to the HTTP contract. Existing tests in `index.test.ts` keep passing unchanged.

### Auth / service-account model

Deliberately simple: the caller supplies `user` and `overrideAccess` directly. The plugin does not invent a "system user" concept — consumers already have their own conventions (a seeded admin user, a dedicated `role: 'agent'` user, `{ id: 'system' }` for audit-log readability). We validate only:

- `mode: 'superuser'` requires `overrideAccess: true` (mirrors today's handler: `const overrideAccess = mode === 'superuser'`).
- `user: null` is allowed only when `overrideAccess: true` (otherwise every tool call hits access checks with no subject and fails).

Access-function callers like `options.access` and `modes.access` are skipped entirely for headless runs — those are HTTP gating logic, not execution logic.

### Budget semantics for headless

Per-user budgets don't apply to background jobs. Options:

- `skipBudget: true` (default for headless in practice) — neither `check` nor `record` runs.
- `skipBudget: false` with a synthetic user — the plugin consumer's `BudgetConfig.check({ req })` signature gets a synthetic `req`; that's enough rope to either charge a dedicated "system" bucket or fall through.

We do **not** add a separate `systemBudget` option. If it becomes a real need we'll revisit, but most teams will track headless spend via cloud provider billing rather than per-user counters.

### Persistence

Out of scope for `runAgent` itself — it returns a `streamText` handle, the caller decides what to do with the result. Two ready-made paths:

- **Scheduled / detached runs** use plan 015's `agent-runs` collection. Plan 015's task handler writes `messages`, `usage`, `status`, etc. without the caller doing anything beyond declaring a `scheduledAgent`.
- **Ad-hoc callers** drain `result.fullStream` (or `await result.text`) and persist the outcome with whatever schema they want — see consumption pattern #2 above (`payload.create({ collection: 'content-reports', data: { body: report } })`).

No `persistAs` / `saveTo` helper on `runAgent`. If a real consumer hits a wall here, revisit — but plan 015 covers the structured case and the local API covers the unstructured case.

### Messages normalisation

`messages` accepts three shapes:

1. `string` — wrapped as `[{ role: 'user', content: string }]` (ModelMessage).
2. `UIMessage[]` — run through `convertToModelMessages(…, { ignoreIncompleteToolCalls: true })` (the same path the HTTP handler uses today).
3. `ModelMessage[]` — passed through verbatim for callers that already built them.

Discrimination is structural: strings by `typeof`, then `Array.isArray(messages[0]?.parts)` for `UIMessage` vs. `messages[0]?.content` for `ModelMessage`. Document the precedence in the JSDoc.

### Tool resolution order

Two factories can shape the toolset: the plugin's global `options.tools` (set once at plugin init) and the per-call `runAgentOpts.tools` (set per `runAgent` invocation). They compose in this fixed order:

```
defaultTools         = buildTools(payload, user, overrideAccess, req?, customEndpoints, config)
baseTools            = options.tools?.({ defaultTools, modelId, req }) ?? defaultTools
finalTools           = runAgentOpts.tools?.(baseTools) ?? baseTools
modeFilteredTools    = filterToolsByMode(finalTools, mode)
```

The plugin's factory always runs first so headless callers inherit the consumer's user-defined tools (e.g. `customTools({ req })` from `dev/src/customTools.ts`). The per-call factory then refines or replaces — typical use is narrowing the surface for a specific job (`(base) => ({ find: base.find })`) without touching plugin config.

When `runAgentOpts.tools` is a static `ToolSet` (not a function), it **replaces** `baseTools` outright — equivalent to `(_base) => staticToolSet`. The static form is a convenience for callers who know exactly which tools they want and don't care about the plugin-resolved base; if they want to compose, they pass the function form.

When `req` is omitted, `runAgent` passes the synthetic shim documented above to `options.tools`. Tools that crash without a real HTTP `req` should either guard on `req.headers.get(...)` returning `null` or be omitted by the consumer's factory when `req.payloadAPI === 'local'`.

The shim is typed as `Pick<PayloadRequest, 'payload' | 'user' | 'payloadAPI' | 'headers'>` and cast at the boundary; locale, i18n, and middleware-attached fields are deliberately absent so a tool that reads them (instead of guarding) fails loudly at the consumer's factory boundary rather than silently producing wrong content. If the consumer's tool genuinely needs `locale` etc., they should construct their own minimal shape inside their `options.tools` factory using `req.payload.config.localization`.

If the `options.tools` factory itself throws — same behaviour as today's HTTP handler (`src/index.ts:297-303`): `runAgent` re-throws the error wrapped with the message `"tools resolver failed: <original>"` so the caller can surface it. The HTTP wrapper continues to translate that into a 500; headless callers (plan 015's task handler) catch it and record `status: 'failed'` on the `agent-runs` doc.

### Custom endpoints tool

`buildTools`' custom-endpoint branch (`src/tools.ts:477-...`) needs `req` because it calls user-defined endpoint handlers. The headless contract:

- **Custom-endpoint tools are skipped when `req` is absent.** `discoverEndpoints` runs the same way (it reads `payload.config`, not `req`), but `buildTools` only emits the `runEndpoint`-style entries when a real `req` is available. The agent's system prompt is built with `hasCustomEndpoints: false` so it doesn't advertise tools that aren't in the toolset.
- **The synthetic minimal `req` (`{ payload, user, payloadAPI: 'local', headers: new Headers() }`) is for the consumer's `options.tools` factory only**, not for `buildTools`'s custom-endpoint branch. This keeps the fake-req surface narrow: user-defined tools that read `req.payload` work; custom Payload endpoints that expect cookies, locale negotiation, or middleware-attached state remain out of scope until a real consumer needs them.

## Resolved decisions

The following questions were open in the draft and are locked here so plans 015 and 017 can build on them without re-debating:

1. **Return shape: raw `streamText` handle.** `RunAgentResult = StreamTextResult<ToolSet, never>`. Plan 015's task handler needs `result.fullStream` to persist deltas into `agent-runs.messages`; a wrapped `{ text, toolCalls, usage }` would force re-streaming or duplicated state. Interactive callers keep `result.toUIMessageStreamResponse(...)`.
2. **Abort default: caller-owned, no implicit signal.** The HTTP path keeps passing `req.signal`. Headless callers either pass their own `abortSignal` (recommended for any run that might exceed the host's idle timeout) or rely on `maxSteps` to terminate. We do **not** install a `process.on('SIGTERM')` default — that surprises consumers who run `runAgent` inside a long-lived worker with its own shutdown protocol. Document the recommendation in JSDoc and the README.
3. **Step cap default: 20 (same as HTTP path).** Headless callers who need more (audits over many pages) opt in via `maxSteps`. Plan 015 raises the per-scheduled-agent default to 50 in the periodic-agents config layer, not here.
4. **Helper API: `createAgentTasks({ scheduledAgents })` ships with plan 015, not as a standalone abstraction.** Plan 015 owns the "translate config into Payload jobs tasks" surface; `runAgent` stays the unopinionated primitive both interactive and scheduled callers use.

## Non-goals

- **Multi-agent orchestration.** One `runAgent` call = one agent. Fan-out/fan-in patterns live above this API.
- **Resumable streams / long-running interactive sessions.** Tracked separately as plan 017 (detached agent runs); the fix from commit `d067193` (`ignoreIncompleteToolCalls: true`) is the pragmatic patch until that lands.
- **Scheduling primitives.** `runAgent` is the primitive; the `scheduledAgents` config layer that translates cron declarations into Payload-jobs tasks ships in plan 015.
- **Persistence.** Where results land is a caller decision. Plan 015 introduces an `agent-runs` collection for scheduled and detached runs; ad-hoc callers persist however they want.

## Dev app demonstration

Add a minimal headless-run example to `chat-agent/dev/`:

- A `dev/src/scripts/run-agent.ts` CLI that boots Payload's local API (`getPayload({ config })`), imports `runAgent` from `@jhb.software/payload-chat-agent`, runs a one-shot prompt against the dev DB (e.g. `"List the three most recently updated posts"`), and prints `result.text` to stdout. Wire it as a `pnpm script` (`pnpm --filter chat-agent-dev run:agent`).
- A seeded `users` doc with a known id the script passes as `user` (or `user: null` + `overrideAccess: true` for the no-auth path). Document both paths in a comment at the top of the script.
- A short README note in `dev/README.md` (or a new "Headless agent" section in the plugin README) showing the command and expected output.

This gives reviewers a one-line way to confirm `runAgent` works end-to-end against real Payload before plan 015 starts wiring it into scheduled tasks.

## Test plan

- Unit: `runAgent` with `user: null` + `overrideAccess: false` rejects. `mode: 'superuser'` + `overrideAccess: false` rejects. `skipBudget: true` never calls `budget.check`. `messages: 'hi'` normalises to a single user ModelMessage.
- Integration: wire a synthetic Payload + stubbed model factory; call `runAgent` with each of the three `messages` shapes and assert `streamText` receives an equivalent prompt.
- Tool composition: when `options.tools` and `runAgentOpts.tools` are both supplied as functions, assert the per-call factory receives the plugin-resolved base (not the raw defaults). When `runAgentOpts.tools` is a static `ToolSet`, assert it replaces `baseTools` outright. When `req` is omitted, assert the consumer's `options.tools` factory is called with the synthetic minimal `req` (`{ payload, user, payloadAPI: 'local', headers: ... }`) and that custom-endpoint tools are absent from the final toolset.
- Plugin-not-installed error: call `runAgent(payload, ...)` against a Payload whose config has no `chatAgentPlugin()` wired in. Assert it throws with a message that names the plugin package and points at the fix ("Did you install `chatAgentPlugin()` in your Payload config?").
- Usage capture: drain `result.fullStream` against a stub provider, then `await result.totalUsage` and assert it returns the same totals `BudgetConfig.record` would have received from `streamText`'s `onFinish`. (Confirms the AI-SDK contract plan 015's handler relies on, without `runAgent` adding its own hook.)
- Regression: the existing `index.test.ts` suite must pass unchanged — the HTTP handler keeps the same observable contract, including `BudgetConfig.record` firing exactly once via `streamText`'s native `onFinish`.
- Docs: add a "Running the agent from a job" section to `chat-agent/README.md` with the audit example.

## Related work

- Plan [015](./015-periodic-background-agents.md) — first concrete consumer; declares cron-scheduled agents that call `runAgent` from Payload-jobs task handlers.
- Plan [017](./017-detached-agent-runs.md) — future direction; reuses `runAgent` + the `agent-runs` collection introduced in 015 for interactive leave-and-come-back chats.
