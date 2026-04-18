---
title: Block schema tools
description: Expose globally-declared Payload blocks to the chat agent via two new read tools (`listBlocks`, `getBlockSchema`) so it can discover which blocks exist and inspect each block's field shape before composing `blocks` content.
type: tool
readiness: ready
---

> **Scope & sequencing.** This plan ships as its own PR. Plan [`013-rich-text-feature-discovery.md`](./013-rich-text-feature-discovery.md) is an independent follow-up that surfaces per-`richText`-field lexical features and emits block slugs under `lexical.options.blocks.slugs`; those slugs are resolved via the `getBlockSchema` tool added here. **Plan 012 does not add any lexical keys to `FieldSchema`.** That surface is entirely 013's concern.

## Problem

The agent can inspect collections and globals via `getCollectionSchema` / `getGlobalSchema`, but it cannot reason about **blocks** as first-class, reusable schema entities.

Blocks declared at the root `config.blocks` (Payload's global block registry, referenced from fields via `blockReferences`) are only visible to the agent when it happens to inspect a collection/global whose field tree references them. If the user asks _"what blocks can I put on a page?"_ or _"show me the `callToAction` block schema"_, there is no direct tool.

Goal: two new read tools so the agent can enumerate and resolve block schemas on demand.

## Proposal

### Tool 1: `listBlocks`

Returns the slug catalog of globally-declared blocks.

- **Input**: none.
- **Output**: `{ blocks: Array<{ slug: string; labels?: { singular?: StaticLabel; plural?: StaticLabel }; interfaceName?: string }> }`.
- **Source**: `config.blocks` (the sanitized `PayloadConfigForPrompt.blocks`).
- **Registration gate**: only registered when `config` is available (same gate as `getCollectionSchema` / `getGlobalSchema`). When `config.blocks` is `undefined` or an empty array, the tool is still registered if `config` exists — it just returns `{ blocks: [] }`. (Rationale: gate mirrors the other schema tools. The system-prompt bullet uses the stricter `config.blocks?.length > 0` gate so the agent is not told to call a tool that returns nothing.)
- **Labels**: normalize each label value via the existing `normalizeLabel` helper in `schema.ts:25`. Labels on blocks are Payload's standard `{ singular?, plural? }` shape where each leaf is `string | Record<string, string> | LabelFunction | false`; `normalizeLabel` collapses function/`false` to `undefined`. Omit the `labels` key from the output entry if both singular and plural normalize to `undefined`.
- Returns slugs/labels/interfaceName only — **not** fields, to keep the response small. Fields are fetched via `getBlockSchema`.

### Tool 2: `getBlockSchema`

Returns the field schema for a single block.

- **Input**: `{ slug: string }`.
- **Output** on success: `{ slug: string; fields: FieldSchema[]; labels?: { singular?: StaticLabel; plural?: StaticLabel }; interfaceName?: string }`.
- **Output** on miss: `{ error: string }` with message `Unknown block slug "<slug>"`.
- **Source**: `config.blocks` registry, resolved via the existing `blocksBySlug` map built in `tools.ts` before the tool definitions.
- **Fields**: reuses `extractFields(block.fields ?? [], blocksBySlug)` so nested `blockReferences` inside the block's own fields continue to resolve transparently — the agent can drill into composite blocks the same way it drills into collection fields today.

### System-prompt update

Add one rule bullet to `system-prompt.ts`, gated on `config.blocks?.length > 0`:

> Call `listBlocks` to see globally-declared blocks, and `getBlockSchema({ slug })` to inspect a block's fields before inserting it into a `blocks` field.

No slug catalog for blocks in the prompt itself — the list could be long, and the agent can fetch it on demand.

## Implementation

### 1. `schema.ts`

Extend `RawBlock` (currently at `schema.ts:52-55`) with optional fields that `listBlocks` / `getBlockSchema` expose:

```ts
export interface RawBlock {
  fields?: readonly unknown[]
  slug: string
  labels?: { singular?: unknown; plural?: unknown }
  interfaceName?: string
}
```

No other changes to `schema.ts`. `FieldSchema` stays as-is. `extractFields` is unchanged.

### 2. `tools.ts`

Register `listBlocks` and `getBlockSchema` inside the existing `config ?` conditional (the same block that already defines `getCollectionSchema` / `getGlobalSchema` / `listEndpoints`). Append `'listBlocks'` and `'getBlockSchema'` to `READ_TOOL_NAMES` at `tools.ts:31-39`.

Reference implementation (use this shape; no `as any` casts):

```ts
listBlocks: {
  description:
    'List all globally-declared blocks (config.blocks). These blocks can be referenced from `blocks` fields and inserted into lexical fields configured with BlocksFeature.',
  inputSchema: z.object({}),
  execute: () => ({
    blocks: (config.blocks ?? []).map((block) => {
      const singular = normalizeLabel(block.labels?.singular)
      const plural = normalizeLabel(block.labels?.plural)
      const labels =
        singular !== undefined || plural !== undefined
          ? { ...(singular !== undefined && { singular }), ...(plural !== undefined && { plural }) }
          : undefined
      return {
        slug: block.slug,
        ...(labels && { labels }),
        ...(typeof block.interfaceName === 'string' && { interfaceName: block.interfaceName }),
      }
    }),
  }),
},

getBlockSchema: {
  description:
    "Get the field schema for a globally-declared block by slug. Call listBlocks first to discover slugs. Returns { error } if the slug is unknown.",
  inputSchema: z.object({ slug: z.string().describe('Block slug from listBlocks') }),
  execute: ({ slug }) => {
    const block = blocksBySlug[slug]
    if (!block) return { error: `Unknown block slug "${slug}"` }
    const singular = normalizeLabel(block.labels?.singular)
    const plural = normalizeLabel(block.labels?.plural)
    const labels =
      singular !== undefined || plural !== undefined
        ? { ...(singular !== undefined && { singular }), ...(plural !== undefined && { plural }) }
        : undefined
    return {
      slug,
      fields: extractFields((block.fields as RawField[] | undefined) ?? [], blocksBySlug),
      ...(labels && { labels }),
      ...(typeof block.interfaceName === 'string' && { interfaceName: block.interfaceName }),
    }
  },
},
```

Import `normalizeLabel` from `./schema.js` alongside `extractFields`. The `RawField` cast on `block.fields` mirrors how `extractFields` already narrows untyped field arrays elsewhere in the file.

### 3. `system-prompt.ts`

Add the bullet described above, next to the existing schema-related rules (current version lives around `system-prompt.ts:65`). Gate on `config.blocks?.length > 0`.

### 4. Contract test + stale comment

- `tools.test.ts` has a contract test around lines 41-56 that locks the full set of tool names. Add `'listBlocks'` and `'getBlockSchema'` to it.
- `tools.test.ts` has a stale comment around lines 784-786 that asserts these tools do not yet exist. Update or delete it.

## Tests

Test-driven per `CLAUDE.md` — write failing tests first.

### `tools.test.ts`

- **`listBlocks` returns slugs from `config.blocks`.** Build a config with two global blocks (`hero`, `callToAction`), invoke the tool, assert both slugs present, order preserved.
- **`listBlocks` surfaces normalized labels and `interfaceName` when set.** One block with `labels: { singular: 'Hero', plural: 'Heroes' }, interfaceName: 'HeroBlock'`; assert they round-trip as plain strings, `interfaceName === 'HeroBlock'`.
- **`listBlocks` omits `labels` when both leaves normalize to undefined.** Block with `labels: { singular: () => 'X' }` (function form) → output entry has no `labels` key (not `labels: {}`).
- **`listBlocks` returns `{ blocks: [] }` when `config.blocks` is empty or absent.** Tool is still registered as long as `config` is present.
- **Tools are absent when `config` is not passed.** Matches the existing `config ?` gate for `getCollectionSchema` / `getGlobalSchema`.
- **`getBlockSchema` returns fields for a known slug.** Invoke with `slug: 'hero'`; assert returned `fields` includes the block's declared fields by name.
- **`getBlockSchema` returns `{ error }` for an unknown slug.** Invoke with `slug: 'nope'`; assert exact error string.
- **`getBlockSchema` resolves nested `blockReferences`.** Block A contains a `blocks` field whose `blockReferences: ['child']` points at block B; assert the resolved schema contains block B's fields under the nested block (exercises the shared `blocksBySlug` and `extractFields`).
- **Read/ask-mode filter keeps both tools.** `filterToolsByMode(tools, 'read')` and `filterToolsByMode(tools, 'ask')` include `listBlocks` and `getBlockSchema`.
- **Contract test at `tools.test.ts:41-56` is extended.** The locked tool-name set includes `'listBlocks'` and `'getBlockSchema'`.

### `system-prompt.test.ts`

- **New bullet is included when `config.blocks` has entries.**
- **New bullet is absent when `config.blocks` is `[]` or `undefined`.**

## Non-goals

- **Not a block authoring/editing tool.** The agent uses `create` / `update` with `data` that includes blocks — no separate `addBlock` tool. These schema tools exist so the agent knows _what_ to put into that `data`.
- **No runtime validation of block data.** Payload's own validation is authoritative; the agent must not try to precheck.
- **No per-field lexical surfacing.** Covered by plan 013. Do not add `lexicalBlocks` / `lexicalInlineBlocks` / `lexical` keys on `FieldSchema` in this plan.
- **No i18n label resolution.** `normalizeLabel` collapses `LabelFunction` / `false` to `undefined`; agent treats the remaining `string | Record<string,string>` as opaque.
- **No caching.** `config.blocks` is in memory already; resolution is trivial.

## Resolved decisions

- **Labels.** Normalize via the existing `normalizeLabel` helper in `schema.ts`. Each `{ singular, plural }` leaf is normalized independently; if both collapse to `undefined`, the `labels` key is omitted from the tool output entry.
- **Tool naming.** `listBlocks` / `getBlockSchema` — mirrors `listEndpoints` / `getCollectionSchema`.
- **`RawBlock` extension.** Add optional `labels?: { singular?: unknown; plural?: unknown }` and `interfaceName?: string`. Both stay optional — many blocks omit them.
- **Empty-catalog behavior.** `listBlocks` returns `{ blocks: [] }` when there are no global blocks; tool stays registered as long as `config` is present. The system-prompt bullet uses the stricter `config.blocks?.length > 0` gate to avoid telling the agent to call a tool that returns nothing.
- **Per-field lexical surfacing.** Out of scope — owned by plan 013. This plan does **not** touch `FieldSchema`.
- **Sequencing.** Ships first; plan 013 builds on the tools added here.

## Changelog

Add one `## Unreleased` → `### Added` (or `feat:` bullet) entry to `chat-agent/CHANGELOG.md`:

> `listBlocks` and `getBlockSchema` tools to let the agent enumerate and inspect globally-declared blocks.
