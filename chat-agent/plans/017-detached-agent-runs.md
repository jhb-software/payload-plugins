---
title: Detached agent runs (leave-and-come-back)
description: Let users submit a prompt and walk away — the agent keeps running server-side, persists progress as it goes, and the browser picks the conversation back up on reopen. Builds on `runAgent` (plan 014).
type: feature
readiness: idea
---

> **Not scheduled.** This is a future direction, kept here so the shape is documented before anyone reaches for it. Plans [014](./014-headless-agent-runner.md) (`runAgent`) and [015](./015-periodic-background-agents.md) (`agent-runs` collection + `chat-agent:run:<slug>` task slug) ship first; this plan only becomes tractable once those exist and remove the "HTTP handler is the only entry point" constraint, and once a place to stream chunks into is established.

## Problem

Today a chat turn's lifetime is the HTTP response stream. If the browser tab closes — deliberately or because the user walks away — the server aborts the LLM call via `req.signal` (intentional cost control) and the turn is lost. The partial state is either discarded, or saved client-side via `onError` and re-sent on next load (which is how corrupt `tool_use.input` bugs crept in; see commit `d067193`).

For long-running turns — a site-wide audit, a multi-step refactor plan, a translation batch across 200 pages — this makes the UX brittle:

- User has to keep the tab open and the laptop awake for minutes.
- Any network hiccup kills the run.
- There's no "submit and check back later" option.
- Multi-device (start on desktop, finish reading on phone) is impossible.

Background jobs via `runAgent` (plan 014) solve _scheduled_ and _non-interactive_ use cases but don't help an interactive user who wants to detach mid-run.

## Proposal

Decouple the chat turn's compute lifetime from any one HTTP connection. The user submits a prompt; the server enqueues a job; the UI subscribes to a progress feed. Closing the browser does not abort the run; reopening rehydrates wherever the agent currently is.

### High-level flow

```
Browser                         Chat endpoint                       Job worker                LLM provider
   │                                  │                                   │                         │
   │ POST /chat-agent/chat  ─────────▶│                                   │                         │
   │  { messages, mode, …,            │                                   │                         │
   │    detached: true }              │ jobs.queue({                      │                         │
   │                                  │   task:                           │                         │
   │                                  │     'chat-agent:run:detached',    │                         │
   │                                  │   input: {conversationId,         │                         │
   │                                  │     messages, mode, userId, …}})  │                         │
   │ 202 Accepted ◀──────────────────┤                                   │                         │
   │   { runId }                      │                                   │                         │
   │                                  │                                   │                         │
   │                                  │                                   │ runAgent(payload, …) ──▶│
   │ GET /chat-agent/chat/runs/:id   ─┼──────────▶ subscribe ─────────────▶│  (streaming)            │
   │   (SSE)                          │                                   │                         │
   │ ◀── text delta                   │                                   │  appends each           │
   │ ◀── tool-call                    │                                   │  delta to               │
   │ ◀── tool-result                  │                                   │  agent-runs.chunks      │
   │ ◀── finish                       │                                   │  (incremental writes;   │
   │                                  │                                   │   plan-017 addition)    │
```

Key properties:

- The `POST /chat-agent/chat` endpoint is non-streaming when `detached: true` — it returns immediately after enqueueing onto plan 015's task family.
- The job worker is the sole consumer of the LLM stream. It persists every chunk into the `agent-runs` doc (the incremental field this plan adds; see "Persistence target" below) as it arrives.
- The client reconnects via a _separate_ read-only SSE endpoint (`/chat-agent/chat/runs/:id`) that tails the persisted stream, so reopening the browser later just resumes the tail from whatever's stored.

### Payload jobs integration

This reuses plan 015's machinery rather than introducing a parallel task:

- **Task slug.** Plan 015 ships `chat-agent:run:<slug>` for cron-triggered scheduled agents. Detached-run support extends the same task family — either by registering a generic `chat-agent:run:detached` task that accepts an inline-prompt input shape, or by promoting plan 015's per-slug handler factory so it accepts `{ messages, mode, model }` from the queue payload as well as from the static config. Concrete shape is decided when this plan is picked up; the constraint is "one handler, two triggers (cron and user-initiated)".
- **Persistence target.** Reuse the `agent-runs` collection introduced in plan 015 — the schema (`status`, `messages`, `usage`, `error`, `startedAt`, `finishedAt`, `jobId`) already covers what a detached run needs. Three **schema- / access-additive changes** this plan makes on top of 015's MVP:
  1. **`conversationId` foreign key** on `agent-runs` so the tail endpoint can map `runId → conversation` for the resume-on-load case.
  2. **`triggeredBy` group** (`{ type: 'cron' | 'manual' | 'detached', userId?: relation }`) — cron-triggered runs continue to set `type: 'cron'`; detached runs set `type: 'detached'` and the submitting user's id. Refines the `read` access callback plan 015 ships with: `(args) => args.doc?.triggeredBy?.userId === args.req.user?.id || isPluginAccessAllowed(args.req)`. The submitter sees their own pending runs even if `options.access` is admin-only; everyone else still goes through the existing gate.
  3. **Incremental writes / `chunks` field.** Plan 015 writes `messages` as a single `ModelMessage[]` once at end-of-run, which is fine for cron audits but blocks tailing. Plan 017 either (a) adds a `chunks: json` field that's appended to as `result.fullStream` drains, or (b) flushes `messages` every N steps. Decide alongside the tail-endpoint design.
  4. Keep `agent-conversations` for interactive history; on `onFinish` the task collapses the streamed deltas into a single assistant message and appends it to the conversation, leaving the raw delta trail in `agent-runs`.
- **Detached-only input.** Cron-triggered runs read their prompt from plugin config; detached runs receive `{ messages, mode, model, conversationId, userId }` from `payload.jobs.queue` at submit time. The plan-015 handler grows a thin discriminator over its input shape.

```ts
// Sketch — exact slug/inputSchema TBD when this plan is picked up.
await req.payload.jobs.queue({
  task: 'chat-agent:run:detached',
  input: { conversationId, messages: body.messages, mode: body.mode, userId: req.user?.id ?? null },
})
```

What Payload gives us for free:

1. **Persisted input / output.** The job record stores the prompt and the final result, so reruns and audits are trivial.
2. **State machine.** `queued` → `running` → `succeeded` / `failed`, with timestamps. The UI can surface "running since 2m ago" without the plugin inventing a schema.
3. **Retry policy.** Configurable per-task. For LLM runs we'd cap at 1 retry or 0 — the cost of a re-run is real money, and partial progress is already persisted in `agent-runs`. Default to 0 and document why (matches plan 015).
4. **Worker lifecycle.** Payload supports both inline execution (after-response hook) and dedicated workers (`payload jobs:run` CLI, or a scheduled HTTP trigger on serverless). For agent runs we want **a dedicated worker** — a 5-minute audit will exceed most serverless request timeouts if run inline.
5. **Scheduling primitive.** `jobs.autoRun` already powers plan 015's cron-driven runs; this plan piggybacks the same task family with `payload.jobs.queue` as the trigger instead of a cron tick.

What we'd add on top:

- A **tail endpoint** (`GET /chat-agent/chat/runs/:id`, SSE) that reads from the incremental field this plan adds (`agent-runs.chunks` or per-step flushes of `messages`; see "Persistence target" above) and emits an AI-SDK-compatible `UIMessageChunk` stream, so the existing `useChat` transport can consume it without a second client protocol.
- A **resume-on-load hook** in the client: when `useChat` mounts and the last conversation message is an in-progress assistant run, look up the active `agent-runs` doc by `conversationId` and auto-subscribe to its tail endpoint instead of rendering static history.
- A **finish-time conversation merge.** Once the run reaches `succeeded`, the task appends a single consolidated assistant message to `agent-conversations.messages[]`, keeping the chat list free of half-written deltas.

### What changes for the browser

`useChat`'s transport grows a third path alongside `prepareSendMessagesRequest`:

- **`immediate` (today's default)** — POST streams the response inline.
- **`detached`** — POST returns `{ runId }`; the hook opens an SSE subscription to `/chat-agent/chat/runs/:id` and treats that as the stream.
- **`resume`** — on mount, if the conversation has a pending run, open the subscription without POSTing.

The user opts in per-message or per-conversation. Detached is probably the right default for `mode: 'read-write'` / `'superuser'` turns (slow, expensive); immediate is right for most chat exchanges.

### Scope boundaries

Explicitly **out of scope** for this plan:

- Resuming an _aborted_ run. If the worker dies mid-stream, partial progress stays persisted but the run is marked `failed` — user retries manually. True mid-stream resumption would need the AI SDK's `experimental_resume` primitives and provider cooperation.
- Cross-device session transfer beyond what reopening-the-conversation-URL gives you.
- Real-time collaboration (two browsers watching the same run). The tail endpoint supports it mechanically, but the UI conflict-resolution story is its own design problem.

### Non-obvious risks

- **Cost runaway.** Without the "tab close → abort" failsafe, a runaway agent burns tokens until it hits `maxSteps`. Budget enforcement (the existing `BudgetConfig.record` hook, called on `onFinish`) becomes more important, not less.
- **Orphaned runs.** A worker crash leaves `running` jobs stranded. Payload's job machinery handles this via stale-lease recovery, but we need to verify behaviour with long-running LLM calls specifically.
- **Auth across tabs.** The tail endpoint must gate reads by `conversationId` ownership the same way the existing conversations endpoints do — stealing a `runId` must not leak another user's stream.
- **Storage growth.** Persisting every delta into `agent-runs.messages` inflates the table; for a 5-minute audit that's ~thousands of tiny records. Compact deltas into a single assistant message on `onFinish` and either keep the raw delta trail under a TTL, or drop it once the conversation merge is complete. Decide alongside plan 015 so both flows agree on retention.

## Prerequisites

- **Plan 014 (`runAgent`).** Hard-blocked. Until the chat handler's orchestration is extracted, there's no clean way for a job task handler to invoke an agent turn with the same tools/prompt/model config.
- **Plan 015 (periodic background agents).** Soft-blocked. Plan 015 introduces the `agent-runs` collection, the `chat-agent:run:<slug>` task family, and the streaming-persist pattern this plan piggybacks on; without it this plan would have to invent equivalent persistence and worker plumbing from scratch.

## Dev app demonstration

When this plan is picked up, `chat-agent/dev/` should grow:

- A `detached: true` toggle in the dev chat UI (or a separate "Long-running run" demo page) that submits a deliberately slow prompt — e.g. `"For each post, suggest a better SEO title"` over the seeded posts — so reviewers can close the tab, reopen it, and see the run resume.
- A seeded conversation with an in-progress `agent-runs` doc to demonstrate the resume-on-load hook without needing to wait for a real provider response.
- A short README note showing the user-facing flow ("submit, close tab, reopen, see progress") and the network calls underlying it (POST returns 202, SSE tail picks up).

## Test plan

Sketched only — actual tests get written alongside implementation.

- Job handler end-to-end: enqueue a run against a stub provider, let the worker drain it, assert the conversation document contains the final assistant message.
- Tail endpoint: subscribe with a conversation that already has a completed run, assert the endpoint replays the persisted chunks and closes cleanly.
- Abort semantics: close the tail subscription mid-run, assert the worker keeps running (does _not_ abort) and the next subscriber catches up from whatever's persisted.
- Authorization: a user subscribing to someone else's `runId` gets `401`, even if the `conversationId` is guessable.
- Cost cap: a run that exceeds `maxSteps` stops cleanly and records usage once via the budget hook, no double-counting.

## Related work

- Plan [014](./014-headless-agent-runner.md) — `runAgent` primitive this depends on.
- Plan [015](./015-periodic-background-agents.md) — supplies the `agent-runs` collection and `chat-agent:run:<slug>` task family this plan reuses; cron-triggered sibling of the user-initiated detached flow.
- AI SDK resumable streams (`experimental_resume`, `UIMessageStream` resume primitives) — worth revisiting once this plan is picked up; may obviate part of the tail-endpoint design.
