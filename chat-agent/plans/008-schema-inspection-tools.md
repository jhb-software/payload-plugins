---
title: Schema inspection tools
description: Expose collection, global, and block schemas as read-only tools so the agent fetches field details on demand instead of receiving the full schema in every system prompt
status: planned
depends_on: 007-on-demand-discovery.md
---

## Problem

Even after plan 007 moves custom endpoints to a tool, the heaviest part of the system prompt is still the full field schema for every collection and global (`schema.ts:230-245`). On schemas with many collections or deeply nested block structures, that dominates the prompt budget on every request.

The agent also rarely needs _every_ collection's fields in a single turn — a question about `posts` does not require the `media` schema.

## Proposal

Build on the discovery framework from plan 007: shrink the prompt to a slug catalog and introduce read-only tools the agent calls when it actually needs field details.

### New tools (read-only, available in every mode)

| Tool                            | Input | Returns                                                           |
| ------------------------------- | ----- | ----------------------------------------------------------------- |
| `listCollections`               | —     | `[{ slug, upload, hasFields }]` from `payload.config.collections` |
| `listGlobals`                   | —     | `[{ slug }]` from `payload.config.globals`                        |
| `listBlocks`                    | —     | `[{ slug }]` from `payload.config.blocks` (shared blocks)         |
| `getCollectionSchema({ slug })` | slug  | Extracted fields (reuse `extractFields`) + `upload` flag          |
| `getGlobalSchema({ slug })`     | slug  | Extracted fields                                                  |
| `getBlockSchema({ slug })`      | slug  | Extracted fields for that block definition                        |

All classified as reads, added to `READ_TOOL_NAMES` so they're available in every mode (including `read`).

### System prompt changes

Controlled by the `discovery` flag introduced in plan 007:

- `inline` — current behaviour: full field dumps in the prompt, schema tools not registered.
- `tools` — no schema in the prompt at all; agent must call `listCollections` / `listGlobals` and the inspect tools to learn field shapes.
- `hybrid` (default) — prompt carries a **slug catalog** (one line per collection and global, no fields); inspect tools handle field details. This mirrors Plan 007's hybrid shape.

The prompt adds one sentence under `## Rules`: _"Call `getCollectionSchema` / `getGlobalSchema` / `getBlockSchema` when you need field details before querying or writing."_

Upload-collection listing and localization info stay inline in every mode — they're small and the agent needs them to pick `locale` / know whether uploads are possible.

### Implementation notes

- Put the new tools in `tools.ts` next to `find` / `findByID`; extend `READ_TOOL_NAMES`.
- Reuse `extractFields` + `RawBlock` from `schema.ts` — no duplicate traversal logic.
- `buildTools` needs access to `payload.config` (blocks, collections, globals) — pass it through or read from `payload.config` directly.
- Unknown slug returns `{ error: 'unknown slug' }` so the agent can recover gracefully rather than seeing a thrown exception in the tool-result stream.
- No access gating on schema tools — field names are already considered LLM-visible per the existing threat model (same reasoning as the inline prompt today).

## Trade-off

Large schemas: major prompt-token savings, at the cost of 1–2 extra tool-call round trips on the first turn that needs schema knowledge. Small schemas: round trips aren't worth it — `discovery: 'inline'` stays available.

The `hybrid` default keeps the slug catalog in the prompt so the agent at least knows _what exists_ without a round trip, mirroring how a developer skims a Payload config.

## Tests

- `listCollections` returns slugs in the config's order.
- `getCollectionSchema` for a known slug returns the same field shape `extractFields` produces for that collection.
- `getCollectionSchema` / `getGlobalSchema` / `getBlockSchema` with an unknown slug return an error object — not a throw.
- `buildSystemPrompt` with `discovery: 'tools'` contains neither the slug catalog nor the field dump.
- `buildSystemPrompt` with `discovery: 'hybrid'` contains the slug catalog and not the field dump.
- `buildSystemPrompt` with `discovery: 'inline'` keeps the current field dump behaviour.

## Out of scope

- Caching — tools read directly from the sanitized config, already in memory.
- Pagination of schema responses — field trees are small enough to return whole.
- A `search-fields` tool — YAGNI until someone asks.
