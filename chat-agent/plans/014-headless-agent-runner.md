---
title: Headless agent runner
description: Extract the chat endpoint's orchestration into a reusable `runAgent` function so background jobs (cron, Payload jobs queue, webhooks) can invoke the agent off-HTTP — e.g. a weekly content audit — without holding an open connection to a human client.
type: feature
readiness: draft
---

## Problem

The chat agent today runs only inside the `POST /chat-agent/chat` endpoint. Everything — auth, mode resolution, budget check, tool building, system prompt, model resolution, `streamText` wiring — lives in one handler and hangs off `req` (`src/index.ts:186-362`). The moment the client disconnects, `req.signal` fires and `streamText` aborts, which is the right default for interactive chat (see plan `014-…`? no — see `index.test.ts` "cancels the provider call when the client disconnects mid-stream") but makes headless use impossible:

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

```ts
// chat-agent/src/runAgent.ts
import type { ModelMessage, StreamTextResult, ToolSet, UIMessage } from 'ai'
import type { Payload, PayloadRequest } from 'payload'

import type { AgentMode, ChatAgentPluginOptions } from './types.js'

export interface RunAgentOptions {
  /** Payload Local API instance. */
  payload: Payload

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
   * Replace the derived system prompt entirely, or extend it. `(base) => string`
   * lets jobs append task-specific instructions without re-deriving the
   * collection/globals summary.
   */
  systemPrompt?: string | ((basePrompt: string) => string)

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
   * HTTP handler passes `req`; background jobs can pass a minimal
   * `{ payload, user }` shim or omit it (custom-endpoint tools are skipped).
   */
  req?: PayloadRequest
}

/** Result mirrors `streamText`'s handle so callers choose how to consume it. */
export type RunAgentResult = StreamTextResult<ToolSet, never>

export function createAgentRunner(
  pluginOptions: ChatAgentPluginOptions,
): (opts: RunAgentOptions) => Promise<RunAgentResult>
```

Consumption patterns:

```ts
// 1. HTTP handler — today's chat endpoint becomes a thin wrapper.
const result = await runAgent({
  payload: req.payload,
  user: req.user,
  messages: body.messages,
  mode: body.mode,
  model: body.model,
  abortSignal: req.signal,
  req,
})
return result.toUIMessageStreamResponse({ headers, messageMetadata })

// 2. Background job — await to completion, read the final text.
const result = await runAgent({
  payload,
  user: { id: 'system', email: 'agent@internal' },
  overrideAccess: true,
  mode: 'read',
  messages: 'Audit all pages in the `pages` collection published in the last 7 days. List ones with fewer than 200 words or without a hero image.',
  maxSteps: 40,
  skipBudget: true,
})
const report = await result.text
await payload.create({ collection: 'content-reports', data: { body: report } })

// 3. One-shot tool-call — narrow the tool set explicitly.
const result = await runAgent({
  payload,
  user,
  messages: prompt,
  tools: (base) => ({ find: base.find, findByID: base.findByID }),
})
```

### Wiring from the plugin

The plugin factory exposes `runAgent` on `config.custom.chatAgent` so consumers can reach it from their own tasks without importing the module directly:

```ts
// Consumer code — e.g. a Payload task handler.
export const weeklyAudit: TaskHandler = async ({ req }) => {
  const { runAgent } = req.payload.config.custom.chatAgent
  const result = await runAgent({
    payload: req.payload,
    user: null,
    overrideAccess: true,
    mode: 'read',
    messages: 'Produce a content audit…',
  })
  // …persist result.text somewhere.
}
```

Also re-exported from the top-level entry point for callers that already have the plugin options in hand but not `payload.config.custom`:

```ts
import { createAgentRunner } from '@jhb.software/payload-chat-agent'
const runAgent = createAgentRunner(pluginOptions)
```

### What moves where

`src/index.ts:186-362` splits into:

1. `src/runAgent.ts` — owns mode resolution, budget check, tool discovery, tool filtering, system-prompt build, model resolution, `streamText` call. Pure — no `Response` / HTTP awareness.
2. `src/index.ts` handler — parses/validates the body, calls `runAgent`, wraps the result with `toUIMessageStreamResponse` and the budget headers.

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

Out of scope. The chat endpoint persists via the client, and headless callers decide where results land — no two audit pipelines want the same schema. If demand appears we can add a thin helper:

```ts
await runAgent({ …, persistAs: { collection: 'agent-conversations', title: 'Weekly audit 2026-W16' } })
```

but ship it in a follow-up.

### Messages normalisation

`messages` accepts three shapes:

1. `string` — wrapped as `[{ role: 'user', content: string }]` (ModelMessage).
2. `UIMessage[]` — run through `convertToModelMessages(…, { ignoreIncompleteToolCalls: true })` (the same path the HTTP handler uses today).
3. `ModelMessage[]` — passed through verbatim for callers that already built them.

Discrimination is structural: strings by `typeof`, then `Array.isArray(messages[0]?.parts)` for `UIMessage` vs. `messages[0]?.content` for `ModelMessage`. Document the precedence in the JSDoc.

### Custom endpoints tool

`buildTools`' custom-endpoint branch (`src/tools.ts:477-...`) needs `req` because it calls user-defined endpoint handlers. For headless callers we have two options:

- **Skip custom-endpoint tools when `req` is absent** (simplest, documented). The agent loses those tools for background runs; most don't need them.
- **Synthesize a minimal `req`** — `{ payload, user, i18n, locale, fallbackLocale, headers: new Headers(), …Object.create(null) }`. Works for well-behaved custom endpoints but leaks the fake-req abstraction into plugin territory.

Ship with option 1. Upgrade to option 2 if a consumer hits the limit.

## Open questions

1. **Return shape**: return the raw `streamText` handle, or a richer object (`{ text, toolCalls, usage, stream }`)? The raw handle gives callers maximum flexibility (stream vs. await) and matches the existing handler's call site — lean that way unless reviewers disagree.

2. **Abort default for headless**: today the HTTP path passes `req.signal`. Headless callers who forget to pass `abortSignal` can leak a long-running `streamText` on process exit. Consider defaulting to a signal tied to `process.on('SIGTERM')` when none is given, or clearly document that callers own lifetime.

3. **Step cap default for headless**: interactive uses `maxSteps: 20`. For a weekly audit that reads the whole site, 20 is too low; 100+ may be appropriate. Revisit when the first real consumer ships — for now the option is a straight pass-through and the default matches the HTTP path.

4. **Discoverability**: do we ship a thin `payloadTask` helper (`createAgentTask({ input, instruction, onResult })`) that wraps `runAgent` + `payload.jobs.queue` boilerplate, or leave orchestration to the consumer? Leaning toward "not yet" — the boilerplate is ~15 lines and a helper locks in opinions about where results go.

## Non-goals

- **Resumable streams / long-running interactive sessions.** `experimental_resume` and stream continuation across multiple HTTP requests are a separate, bigger problem. The fix from commit `d067193` (`ignoreIncompleteToolCalls: true`) is the pragmatic patch until we tackle that deliberately.
- **Scheduling primitives.** Payload has its `jobs` queue; teams use Vercel Cron, GitHub Actions, etc. The plugin provides the runner; the caller provides the trigger.
- **Multi-agent orchestration.** One `runAgent` call = one agent. Fan-out/fan-in patterns live above this API.

## Test plan

- Unit: `runAgent` with `user: null` + `overrideAccess: false` rejects. `mode: 'superuser'` + `overrideAccess: false` rejects. `skipBudget: true` never calls `budget.check`. `messages: 'hi'` normalises to a single user ModelMessage.
- Integration: wire a synthetic Payload + stubbed model factory; call `runAgent` with each of the three `messages` shapes and assert `streamText` receives an equivalent prompt.
- Regression: the existing `index.test.ts` suite must pass unchanged — the HTTP handler keeps the same observable contract.
- Docs: add a "Running the agent from a job" section to `chat-agent/README.md` with the audit example.
