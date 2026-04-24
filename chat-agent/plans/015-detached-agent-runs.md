---
title: Detached agent runs (leave-and-come-back)
description: Let users submit a prompt and walk away — the agent keeps running server-side, persists progress as it goes, and the browser picks the conversation back up on reopen. Builds on `runAgent` (plan 014).
type: feature
readiness: idea
---

> **Not scheduled.** This is a future direction, kept here so the shape is documented before anyone reaches for it. Plan [014](./014-headless-agent-runner.md) (`runAgent`) ships first; this plan only becomes tractable once `runAgent` exists and removes the "HTTP handler is the only entry point" constraint.

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
Browser                         Chat endpoint                 Job worker                LLM provider
   │                                  │                            │                         │
   │ POST /chat-agent/chat  ─────────▶│                            │                         │
   │  { messages, mode, …,            │                            │                         │
   │    detached: true }              │ jobs.queue({               │                         │
   │                                  │   task: 'agent-run',       │                         │
   │                                  │   input: {conversationId,  │                         │
   │                                  │     messages, mode, …}})   │                         │
   │ 202 Accepted ◀──────────────────┤                            │                         │
   │   { runId }                      │                            │                         │
   │                                  │                            │                         │
   │                                  │                            │ runAgent(...)  ────────▶│
   │ GET /chat-agent/chat/runs/:id   ─┼──────────▶ subscribe ──────▶│  (streaming)            │
   │   (SSE)                          │                            │                         │
   │ ◀── text delta                   │                            │  persists each          │
   │ ◀── tool-call                    │                            │  delta to               │
   │ ◀── tool-result                  │                            │  agent-conversations    │
   │ ◀── finish                       │                            │                         │
```

Key properties:

- The `POST /chat-agent/chat` endpoint is non-streaming when `detached: true` — it returns immediately after enqueueing.
- The job worker is the sole consumer of the LLM stream. It persists every chunk into the conversation document (or a sibling `agent-runs` collection) as it arrives.
- The client reconnects via a _separate_ read-only SSE endpoint (`/chat-agent/chat/runs/:id`) that tails the persisted stream, so reopening the browser later just resumes the tail from whatever's stored.

### Payload jobs integration

This is the natural fit for Payload's jobs/queues system. Concretely:

```ts
// Consumer-side Payload config.
jobs: {
  tasks: [
    {
      slug: 'agent-run',
      inputSchema: z.object({
        conversationId: z.union([z.string(), z.number()]),
        messages: z.array(z.unknown()),
        mode: z.enum(AGENT_MODES).optional(),
        model: z.string().optional(),
        userId: z.union([z.string(), z.number()]).nullable(),
      }),
      handler: async ({ input, req }) => {
        const { runAgent } = req.payload.config.custom.chatAgent
        const user = input.userId
          ? await req.payload.findByID({ collection: 'users', id: input.userId })
          : null
        const result = await runAgent({
          payload: req.payload,
          user,
          messages: input.messages,
          mode: input.mode,
          model: input.model,
          overrideAccess: user == null,
        })

        // Persist each chunk as it arrives so the browser-side tail sees progress.
        for await (const chunk of result.fullStream) {
          await appendToConversation(req.payload, input.conversationId, chunk)
        }
        return { status: 'done' }
      },
    },
  ],
},
```

What Payload gives us for free:

1. **Persisted input / output.** The job record stores the prompt and the final result, so reruns and audits are trivial.
2. **State machine.** `queued` → `running` → `succeeded` / `failed`, with timestamps. The UI can surface "running since 2m ago" without the plugin inventing a schema.
3. **Retry policy.** Configurable per-task. For LLM runs we'd cap at 1 retry or 0 — the cost of a re-run is real money, and partial progress is already persisted in the conversation. Default to 0 and document why.
4. **Worker lifecycle.** Payload supports both inline execution (after-response hook) and dedicated workers (`payload jobs:run` CLI, or a scheduled HTTP trigger on serverless). For agent runs we want **a dedicated worker** — a 5-minute audit will exceed most serverless request timeouts if run inline.
5. **Scheduling primitive.** `jobs.autoRun` reuses the same task for cron-triggered runs, so plan 014's weekly audit and this plan's interactive-detach converge on a single task slug — just different triggers (cron vs. `jobs.queue`).

What we'd add on top:

- A conversation-scoped **persistence hook** the task calls on every stream chunk. Simplest shape: append a new `agent-conversations.messages[]` entry, or write deltas into a dedicated `agent-runs` collection keyed by `(conversationId, runId)`. The latter keeps the chat message list clean of half-written assistant turns.
- A **tail endpoint** (`GET /chat-agent/chat/runs/:id`, SSE) that reads from the persistence store and emits an AI-SDK-compatible `UIMessageChunk` stream, so the existing `useChat` transport can consume it without a second client protocol.
- A **resume-on-load hook** in the client: when `useChat` mounts and the last conversation message is an in-progress assistant run, auto-subscribe to the tail endpoint instead of rendering static history.

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
- **Storage growth.** Persisting every delta inflates the conversation document or `agent-runs` table. For a 5-minute audit that's ~thousands of tiny records. Either compact deltas into finished messages on `onFinish`, or TTL the raw deltas and keep only the final assistant message.

## Prerequisites

Hard-blocked on plan 014 (`runAgent`). Until the chat handler's orchestration is extracted, there's no clean way for a job task handler to invoke an agent turn with the same tools/prompt/model config.

## Test plan

Sketched only — actual tests get written alongside implementation.

- Job handler end-to-end: enqueue a run against a stub provider, let the worker drain it, assert the conversation document contains the final assistant message.
- Tail endpoint: subscribe with a conversation that already has a completed run, assert the endpoint replays the persisted chunks and closes cleanly.
- Abort semantics: close the tail subscription mid-run, assert the worker keeps running (does _not_ abort) and the next subscriber catches up from whatever's persisted.
- Authorization: a user subscribing to someone else's `runId` gets `401`, even if the `conversationId` is guessable.
- Cost cap: a run that exceeds `maxSteps` stops cleanly and records usage once via the budget hook, no double-counting.

## Related work

- Plan [014](./014-headless-agent-runner.md) — `runAgent` primitive this depends on.
- AI SDK resumable streams (`experimental_resume`, `UIMessageStream` resume primitives) — worth revisiting once this plan is picked up; may obviate part of the tail-endpoint design.
