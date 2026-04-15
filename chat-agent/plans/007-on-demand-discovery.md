---
title: On-demand discovery of collections, globals, and endpoints
description: Shrink the system prompt from a full dump to a catalog plus read-only tools so the agent pulls details only when it needs them
status: planned
---

## Problem

Today's system prompt ships a lot of static context on every request:

- Every collection's full field schema (`schema.ts:230-236`)
- Every global's full field schema (`schema.ts:238-245`)
- Every shared block's fields (via field expansion)
- Every custom endpoint's path, method, and description (`schema.ts:274-285`)

The payoff is that the agent can plan a `find` or `callEndpoint` without a round trip. The cost is linear in the size of the Payload config and paid on every message — even when the agent only needs one collection, or no schema at all. Per the README's "Schema is shared with the LLM" note, field names are also transmitted unconditionally.

## Proposal

Treat the config as something the agent **discovers** rather than something the prompt declares. The prompt shrinks to a catalog (slugs and endpoint paths, one line each), and new read-only tools let the agent fetch details on demand.

This plan covers the discovery framework plus the concrete switch for **custom endpoints**. Schema inspection tools for collections / globals / blocks build on the same framework and are covered in a follow-up plan (`008-schema-inspection-tools.md`).

### Catalog vs. detail

| Surface          | Catalog (stays in prompt)              | Detail (moves to a tool)  |
| ---------------- | -------------------------------------- | ------------------------- |
| Collections      | slug list                              | fields (see plan 008)     |
| Globals          | slug list                              | fields (see plan 008)     |
| Blocks           | — (only surface via collection/global) | fields (see plan 008)     |
| Custom endpoints | — (none by default)                    | method, path, description |

Endpoints don't need a catalog line because the agent rarely has a reason to discover arbitrary endpoints — they're invoked deliberately. The `listEndpoints` tool is cheap enough that one round trip when needed is fine.

### New tool for this plan

| Tool            | Input | Returns                                                                          |
| --------------- | ----- | -------------------------------------------------------------------------------- |
| `listEndpoints` | —     | `[{ method, path, description }]` for every endpoint with a `custom.description` |

Endpoint entries are small (three short strings) so a single list tool covers both "what exists" and "how do I call it". No separate `getEndpoint` tool.

### System prompt changes

- **Drop** the `## Custom Endpoints` section entirely.
- **Add** one sentence under `## Rules`: _"Call `listEndpoints` to see custom endpoints that can be invoked via `callEndpoint`."_ — only when at least one custom endpoint exists.

### Config flag

```ts
chatAgentPlugin({
  discovery: 'hybrid', // 'inline' | 'tools' | 'hybrid'  (default: 'hybrid')
})
```

- `inline` — current behaviour: schemas and endpoint list in the prompt; discovery tools not registered.
- `tools` — nothing inlined; agent must call discovery tools to learn what exists.
- `hybrid` (default) — prompt carries the lightweight catalog (collection/global slug lists); detail and endpoint list move to tools.

The same flag governs the schema tools in plan 008 so users have a single knob.

### Implementation notes

- Classify the new tool as a read; add to `READ_TOOL_NAMES` so it's available in every mode (including `read`).
- `buildTools` already receives the Payload request — it can read `payload.config.endpoints` directly; no new plumbing.
- Reuse the existing `DiscoverableEndpoint` shape from `tools.ts` so the tool's return type lines up with the prompt builder's input.
- `buildSystemPrompt` accepts the `discovery` mode and omits the endpoint section when the mode is `tools` or `hybrid`.

## Trade-off

Installs with a handful of endpoints pay an extra round trip the first time the agent wants to call one. Installs with dozens of endpoints (a common shape for agent-friendly plugins — see the ongoing "Agent-friendly plugins" initiative) save that list from every prompt going forward. Users who don't want the trade-off set `discovery: 'inline'`.

## Tests

- `listEndpoints` returns only endpoints with a `custom.description`, with method/path/description intact.
- `buildSystemPrompt` omits the `## Custom Endpoints` section when `discovery` is `tools` or `hybrid`.
- `buildSystemPrompt` keeps the section when `discovery` is `inline` (current behaviour is preserved).
- When no custom endpoints exist, neither the prompt section nor the rule sentence appears, regardless of mode.

## Out of scope

- Schema inspection tools (collections / globals / blocks) — see plan 008.
- Caching — the Payload config is already in memory.
- An `invokeEndpoint`-style shortcut — `callEndpoint` already exists.
