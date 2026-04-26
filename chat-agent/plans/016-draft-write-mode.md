---
title: Draft-write mode (instant writes, saved as drafts)
description: Add a new agent mode that lets the agent write without per-call confirmation (like `read-write`) but forces every create/update to be saved as a draft so users can review and publish on their own terms.
type: feature
readiness: draft
---

## Problem

There's a usability gap between the two "write-capable" modes today:

- **`ask`** — the agent can call write tools, but every write pauses on a confirmation dialog (`needsApproval: true`, see `tools.ts:594-606`). Good for high-trust operations, but the round-trip is painful when a user is iterating on content and wants the agent to just _do the work_ — especially on long tasks that involve many small edits (e.g. _"rewrite the intro of all 20 blog posts in the 'news' category"_).
- **`read-write`** — writes execute instantly, but they hit production data directly. Fine for superuser-style maintenance; too sharp for content iteration where the user wants a safety net.

What users actually want for iterative content work: **instant writes with a safety net**. The agent writes freely, no confirmation dialogs, but the result lands as a draft version — nothing is published until the user reviews and publishes it in the admin panel.

Payload already has this primitive: collections (and globals) configured with `versions.drafts` accept `draft: true` on `create` / `update`, which saves a new draft version without publishing. This plan surfaces that primitive as a first-class mode.

## Payload draft semantics

Understanding Payload's draft model is essential for this plan. There are **two separate concepts** that are easy to conflate (and the system prompt already warns the agent about this, see `system-prompt.ts:76`):

1. **The `draft` flag** (tool parameter) — selects which table is read from or written to: the **versions table** (drafts) or the **main collection table** (published). It acts as a "latest version" flag and **relaxes required-field validation** on writes, allowing partial/incomplete documents to be saved.

2. **The `_status` field** (document field) — holds the actual status of the document: `'draft'` or `'published'`. This is a regular field on the document, not a query flag.

What `draft: true` does on a write:

- Writes to the **versions table**, not the main table — so the published version is untouched.
- Relaxes required-field validation, allowing the agent to save work-in-progress content.
- Sets `_status: 'draft'` on the new version.

What this means for `draft-write` mode:

- Forcing `draft: true` on every create/update ensures the agent's changes land in the versions table and never overwrite the published document.
- The user reviews the draft in the admin panel's version history and publishes when ready.
- Collections/globals without `versions.drafts` don't have a versions table, so `draft: true` is a no-op — this is why we must refuse writes to non-drafts-enabled targets (see below).

## Proposal

### New mode: `draft-write`

Add a fourth mode between `ask` and `read-write`:

| Mode              | Writes execute? | Confirmation | Persists as            |
| ----------------- | --------------- | ------------ | ---------------------- |
| `read`            | no              | —            | —                      |
| `ask`             | yes             | per-call     | published              |
| **`draft-write`** | yes             | none         | **draft version**      |
| `read-write`      | yes             | none         | published              |
| `superuser`       | yes             | none         | published (bypass ACL) |

In `draft-write`:

- **No `needsApproval`** on any write tool — writes fire the moment the agent decides to call them, same latency as `read-write`.
- **`draft: true` is forced** on every `create` and `update` call, overriding whatever the agent passes. The agent cannot opt out.
- **`updateGlobal`** forces `draft: true` as well (globals can be drafts-enabled via `versions.drafts` on the global).
- **`delete` is not available.** There is no "draft delete" — deletion is inherently destructive and irreversible. Users who need the agent to delete can switch to `ask` or `read-write`. Filter `delete` out of the tool set in this mode, matching how `read` filters out all writes.
- **`callEndpoint` remains gated with `needsApproval: true`** (same as `ask` mode). The plugin can't know whether a custom endpoint respects `draft: true` or what destructive surface it exposes, so we don't offer the no-confirmation contract for custom endpoints.

### Collections without drafts enabled

`draft: true` on a collection without `versions.drafts` is a silent no-op in Payload — the write becomes a normal published write. That silently breaks the mode's contract (reversibility).

**Decision: refuse the tool call** with a structured error when the target collection (or global) does not have drafts enabled:

```json
{
  "error": "Collection \"posts\" does not have drafts enabled. draft-write mode can only write to collections/globals configured with versions.drafts."
}
```

The agent sees the error and can either tell the user to switch modes or enable drafts on the collection. Failing loudly is better than letting a write go live because of config drift.

Detection uses the same `req.payload.config` already threaded through to `buildTools` — look up `collection.versions?.drafts` / `global.versions?.drafts` and gate the call.

### Access control

Add a per-mode access function slot for `draft-write` (already falls out of the existing `ModesConfig.access` map — it's keyed on `AgentMode`). Default availability matches the `ask` / `read-write` default: available to any authenticated user unless an access function is configured.

### Default mode & selector

- `getDefaultMode` keeps `'ask'` as the default when nothing is configured (don't change existing installs' behavior).
- `ModeSelector` gains a new label:
  - label: `"Draft writes"`
  - description: `"Writes execute without confirmation, saved as drafts"`
- Sorted between `ask` and `read-write` in the dropdown so the progression (read → ask → draft-write → read-write → superuser) reads as increasing trust.

### System prompt

Add a mode-specific block to `buildSystemPrompt` mirroring the existing per-mode branches (`system-prompt.ts:44-64`):

> - You are in **draft-write mode**. Write operations execute immediately without confirmation. Every create/update is written to the versions table with `draft: true` and `_status: 'draft'` — the published document is never overwritten. The user reviews and publishes drafts in the admin panel.
> - `delete` is not available in this mode. If the user asks you to delete something, tell them to switch to "Confirm writes" or "Read & write" mode first.
> - Some collections/globals may not have drafts enabled; writes to those will fail with a clear error. Relay the error and suggest switching modes.
> - You do not need to set `draft: true` yourself — it is forced on every write. Required-field validation is relaxed, so partial saves are fine.

Also skip the line _"Always confirm with the user before creating, updating, or deleting documents"_ in this mode, since the whole point is that the user has _already_ opted in to instant writes.

## Implementation

### 1. `types.ts`

- Append `'draft-write'` to `AGENT_MODES`. Ordering matters for the mode selector, so slot it between `'ask'` and `'read-write'`:
  ```ts
  export const AGENT_MODES = ['read', 'ask', 'draft-write', 'read-write', 'superuser'] as const
  ```
- `AgentMode` picks it up automatically via the `typeof` derivation.
- `PayloadConfigForPrompt` (in `schema.ts`) already exposes `collections` / `globals` — extend its structural shape with `versions?: { drafts?: unknown }` so `tools.ts` can read the drafts flag without casting.

### 2. `tools.ts`

Two changes in `filterToolsByMode`:

```ts
if (mode === 'draft-write') {
  const result: Record<string, ExecutableTool> = {}
  for (const [name, tool] of Object.entries(tools)) {
    if (name === 'delete') continue // destructive, no draft equivalent
    if (name === 'callEndpoint') {
      result[name] = { ...tool, needsApproval: true } as ExecutableTool
      continue
    }
    if (name === 'create' || name === 'update' || name === 'updateGlobal') {
      result[name] = wrapForDraftWrite(tool, name, config)
      continue
    }
    result[name] = tool
  }
  return result
}
```

`wrapForDraftWrite` composes a new `execute` around the original:

1. Resolve the target's drafts-enabled flag from `config` (collection slug for `create`/`update`, global slug for `updateGlobal`).
2. If drafts are **not** enabled, return `{ error: '...' }` without calling through.
3. Otherwise, invoke the original `execute` with `{ ...input, draft: true }` so the forced flag overrides anything the model supplied.

Notes:

- `filterToolsByMode` currently takes `(tools, mode)`. It needs access to `config` to detect the drafts flag. Extend the signature to `(tools, mode, config?)` and thread `config` from the call site in `index.ts:280`.
- Keep `config` optional so existing callers (and the tests) can still invoke `filterToolsByMode` without wiring a full config when they don't exercise draft-write mode.
- The `draft` param is already part of each write tool's `inputSchema`; no schema changes needed — the wrapper just overrides at call time.

### 3. `modes.ts`

No structural change — `resolveAvailableModes` already iterates `AGENT_MODES`, so the new entry is picked up automatically. The per-mode access function path is also already generic.

Tests (`modes.test.ts`) need to be updated to reflect that the default mode list is now `['read', 'ask', 'draft-write', 'read-write']`.

### 4. `system-prompt.ts`

Add a branch to the `mode === …` chain in `buildSystemPrompt` with the bullets above.

### 5. `index.ts`

- Pass `req.payload.config` into `filterToolsByMode` (the `allTools` call at `index.ts:272-280` already has it).
- No change to the `overrideAccess` logic — `draft-write` uses the default `overrideAccess: false`, so user ACL still applies to every write. It's _reversible_, not _privileged_.

### 6. `ui/ModeSelector.tsx`

- Add the new mode to `MODE_LABELS` and `MODE_DESCRIPTIONS`.
- Verify the native `<select>` (or `ReactSelect` after plan 010 lands) orders options by `availableModes` order — it does.

## Tests

Test-driven per CLAUDE.md — start with failing tests.

### `modes.test.ts`

- **`resolveAvailableModes` default list includes `draft-write`**: update existing assertion from `['read', 'ask', 'read-write']` to the new 4-element list.
- **`draft-write` is gated like other modes when an access function returns false**: configure `access: { 'draft-write': () => false }`, assert it's excluded.
- **`validateModeAccess('draft-write', {}, req)` returns `null`**: new valid mode accepted by the validator.

### `tools.test.ts`

- **`filterToolsByMode(tools, 'draft-write', config)` excludes `delete`**: assert `filtered.delete` is undefined.
- **`filterToolsByMode(tools, 'draft-write', config)` excludes the schema-inspection / read tools? no — keeps all reads**: assert all `READ_TOOL_NAMES` survive, same as `ask` mode.
- **`callEndpoint` in `draft-write` mode keeps `needsApproval: true`**: build tools with a custom endpoint, filter, assert `needsApproval === true`.
- **Wrapped `create` forces `draft: true` on the underlying payload call**: build tools with a config where `posts` has `versions.drafts`. Filter for `draft-write`. Execute `tools.create({ collection: 'posts', data: { title: 'x' }, draft: false })` and assert `payload.create` was called with `draft: true` (the agent's `false` is overridden).
- **Wrapped `update` forces `draft: true`**: same invariant on `update`.
- **Wrapped `updateGlobal` forces `draft: true`**: same invariant on `updateGlobal` for a drafts-enabled global.
- **Wrapped `create` refuses collections without drafts**: config where `posts` has no `versions.drafts`. Call `tools.create({ collection: 'posts', data: {} })`. Assert the return value is an `{ error }` payload mentioning the collection slug, and `payload.create` was **not** called.
- **Wrapped `updateGlobal` refuses globals without drafts**: symmetric test for globals.
- **No other tools are wrapped**: `find`, `findByID`, `count`, `findGlobal`, `getCollectionSchema`, `getGlobalSchema` execute unchanged (same mock behavior as `read-write`).

### `index.test.ts`

- **Chat endpoint accepts `mode: 'draft-write'`**: post a request with the new mode and a stub payload config where the target collection has drafts enabled; assert 200 and that `streamText` was called with tool set that includes `create` but not `delete`.
- **Chat endpoint rejects `mode: 'draft-write'` when access gate denies**: configure `modes.access['draft-write']` returning false, assert 403.

### `system-prompt.test.ts`

- **`buildSystemPrompt(..., 'draft-write')` includes the mode-specific instructions**: assert the prompt contains the "saved as a draft version" bullet and the "delete is not available" bullet.
- **`buildSystemPrompt(..., 'draft-write')` does not include the generic "confirm before creating/updating/deleting" bullet**: the whole point of the mode is to skip that.

### `ModeSelector.test.tsx`

- **Renders the new mode with its label**: availableModes includes `draft-write`, the option text is `"Draft writes"`.
- **Shows the new description via `title` attribute** (until plan 010 replaces native `<select>`): mirrors the existing tests for the other modes.

## Non-goals

- **No new "publish" tool.** Publishing drafts is a deliberate human step — that's the whole point. If a user wants the agent to publish, they can switch to `read-write` and ask it to update `_status` to `'published'`.
- **No autosave or diffing UI.** Reviewing drafts happens in the existing Payload admin version UI. This plan ships a mode, not a review surface.
- **No recursive draft enforcement for relationship writes.** If a user's custom endpoint is invoked via `callEndpoint` and that endpoint writes without `draft: true`, this mode can't intercept it. The `needsApproval` gate is the guard.
- **No "soft delete" shim.** We do not synthesize a fake delete that flips `_status` to `draft`. Too much magic; would surprise users. Delete is simply unavailable in this mode.
- **No per-collection opt-out.** If a collection has `versions.drafts` enabled, it's eligible. If not, writes fail loudly. There's no config surface to say "this collection supports drafts but I don't want the agent to use them here" — that's what `access` on the mode is for (whole-mode gate), or collection-level access functions (per-operation gate).

## Open questions / decisions

- **Naming convention.** Considered renaming `ask` → `ask-write` for suffix consistency with `draft-write` / `read-write`, but decided against it: `ask` describes a **behavior** (confirm before mutating), not an operation type, and it governs `callEndpoint` too — not just writes. The `-write` suffix on `draft-write` / `read-write` correctly describes what gets persisted, while `ask` correctly describes how the agent behaves.
- **Ordering in the selector.** Placed between `ask` and `read-write` on the reading "increasing trust" axis. Alternative: group the two no-confirmation modes (`draft-write`, `read-write`) together after `ask`. Both defensible; current choice is the one that reads most intuitively as a progression.
- **Should `draft-write` also force `draft: true` on `find` / `findByID`?** No. Reads are reads — in this mode the agent should see the current (published) state unless the user asks for drafts. The force applies only to writes.
- **`listEndpoints` visibility.** Keep it visible (agent still wants to know what's there even if `callEndpoint` gates on approval). Mirrors current `ask`-mode behavior.
- **Error shape for "drafts not enabled".** Considered throwing (propagates as a tool error) vs. returning `{ error }` (shows up in the tool result). The existing `getCollectionSchema` / `callEndpoint` tools already use `{ error }` for recoverable conditions; follow that convention for consistency.
- **What if a user has a mix of drafts-enabled and drafts-disabled collections and wants the agent to work across both?** They should use `ask` mode. `draft-write` is explicitly opt-in and its failure mode (loud refusal) is the right signal.
- **Interaction with `superuser`.** `draft-write` + `superuser` isn't a combination — modes are mutually exclusive. If a superuser wants reversibility, they pick `draft-write`; they lose `overrideAccess` but gain the safety net. If that combination turns out to be wanted in practice, consider an orthogonal flag in a follow-up — not this plan.
