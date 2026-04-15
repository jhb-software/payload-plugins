---
title: Block schema tools
description: Expose globally-declared Payload blocks to the chat agent so it can discover which blocks exist and inspect each block's field shape before composing `blocks` content (or resolving slugs surfaced by other schema tools).
type: tool
readiness: draft
---

> **Related:** plan [`013-rich-text-feature-discovery.md`](./013-rich-text-feature-discovery.md) surfaces _per-field_ lexical features (including which block slugs a `richText` field accepts). That plan depends on the `getBlockSchema` tool defined here to resolve those slugs to fields. Keep the two scopes disjoint — this plan owns the **block catalog**, plan 013 owns **field-level lexical surfacing**.

## Problem

The agent can inspect collections and globals via `getCollectionSchema` / `getGlobalSchema`, but it cannot reason about **blocks** as first-class, reusable schema entities.

Blocks declared at the root `config.blocks` (Payload's global block registry, referenced from fields via `blockReferences`) are only visible to the agent when it happens to inspect a collection/global whose field tree references them. If the user asks _"what blocks can I put on a page?"_ or _"show me the `callToAction` block schema"_, there's no direct tool.

Goal: two new read tools so the agent can enumerate and resolve block schemas on demand.

## Proposal

### Tool 1: `listBlocks`

Returns the full slug catalog of globally-declared blocks.

- **Input**: none.
- **Output**: `{ blocks: Array<{ slug: string; labels?: { singular?: string; plural?: string }; interfaceName?: string }> }`.
- **Source**: `config.blocks` (the sanitized `PayloadConfigForPrompt.blocks`).
- Only registered when `config` is available (same gate as `getCollectionSchema`).
- Only returns slugs/labels — **not** fields, to keep the response small. Fields are fetched via `getBlockSchema`.

### Tool 2: `getBlockSchema`

Returns the field schema for a single block.

- **Input**: `{ slug: string }`.
- **Output**: `{ slug, fields: FieldSchema[], labels?, interfaceName? }` or `{ error: "Unknown block slug \"...\"" }`.
- **Source**: `config.blocks` registry, resolved via the existing `blocksBySlug` map in `tools.ts:224-228`.
- Reuses `extractFields` so nested `blockReferences` inside the block's own fields continue to resolve transparently — the agent can drill into composite blocks the same way it drills into collection fields today.

### System prompt update

Add a single line to the rules block in `system-prompt.ts`:

> Call `listBlocks` to see globally-declared blocks, and `getBlockSchema({ slug })` to inspect a block's fields before inserting it into a `blocks` field (or a lexical `blocks` / `inlineBlocks` slot — see plan 013 for how those slugs are surfaced per field).

No slug catalog for blocks in the prompt itself — the list could be long and the agent can fetch it on demand.

## Implementation

### 1. `schema.ts`

- Add `lexicalBlocks?: { slug: string }[]` and `lexicalInlineBlocks?: { slug: string }[]` to `FieldSchema`.
- In `extractFields`, after the `field.name` guard, add a branch for `field.type === 'richText'` that:
  - Walks `field.editor?.features` (array) or `resolvedFeatureMap` (Map) looking for the `blocks` feature.
  - Normalizes each entry to `{ slug }`.
  - Registers full inline `Block` objects into the caller-provided `blocksBySlug` — note this requires `blocksBySlug` to be mutable, which it already is in the `tools.ts` call site (plain object literal).
- Export a small helper `collectLexicalBlocks(field, blocksBySlug)` that returns `{ blocks, inlineBlocks }` for reuse/testability.

### 2. `tools.ts`

- Add `listBlocks` and `getBlockSchema` inside the existing `config ?` conditional so they share the same gate as the other schema tools.
- Append `'listBlocks'` and `'getBlockSchema'` to `READ_TOOL_NAMES` so read/ask modes include them.

```ts
listBlocks: {
  description: 'List all globally-declared blocks (config.blocks). These blocks can be referenced from `blocks` fields and inserted into lexical fields configured with BlocksFeature.',
  execute: () => ({
    blocks: (config.blocks ?? []).map((b) => ({
      slug: b.slug,
      // labels / interfaceName are optional on the loose RawBlock shape
      ...(b as { labels?: unknown; interfaceName?: string }).labels !== undefined && { labels: (b as any).labels },
      ...typeof (b as any).interfaceName === 'string' && { interfaceName: (b as any).interfaceName },
    })),
  }),
  inputSchema: z.object({}),
}

getBlockSchema: {
  description: 'Get the field schema for a globally-declared block by slug. Call listBlocks first to discover slugs.',
  execute: (input) => {
    const slug = input.slug as string
    const block = blocksBySlug[slug]
    if (!block) return { error: `Unknown block slug "${slug}"` }
    return {
      slug,
      fields: extractFields(block.fields ?? [], blocksBySlug),
    }
  },
  inputSchema: z.object({ slug: z.string().describe('Block slug from listBlocks') }),
}
```

### 3. `system-prompt.ts`

- Add one rule bullet as described above, gated on `config.blocks?.length` being non-zero (so configs without any global blocks don't get noise).

### 4. `RawBlock` shape

- Extend `RawBlock` in `schema.ts` with optional `labels?: { singular?: string; plural?: string }` and `interfaceName?: string` so `listBlocks` can expose them without casts (keep them optional — many blocks won't have them).

## Tests

Test-driven per CLAUDE.md — write failing tests first.

### `tools.test.ts`

- **listBlocks returns slugs from config.blocks**: build a config with two global blocks (`hero`, `callToAction`), invoke tool, assert both slugs present.
- **listBlocks is absent when config has no blocks**: config with `blocks: []` → tool is not registered (keeps parity with current gating pattern for no-custom-endpoints).
- **getBlockSchema returns fields for a known block**: invoke with `slug: 'hero'`, assert returned `fields` includes the block's fields (by name).
- **getBlockSchema returns `{ error }` for an unknown slug**: invoke with `slug: 'nope'`, assert error payload.
- **getBlockSchema resolves nested blockReferences**: block A contains a `blocks` field whose `blockReferences: ['child']` points at block B; assert the resolved schema contains block B's fields under the nested block.
- **Both tools are filtered in on read mode**: `filterToolsByMode(tools, 'read')` keeps them (they're reads).

### `schema.test.ts` (new or existing)

- **extractFields surfaces lexical BlocksFeature slugs**: field of `type: 'richText'` with an `editor.features` entry of `key: 'blocks'` and `serverFeatureProps.blocks: [{ slug: 'hero', fields: [...] }, 'callToAction']` produces `{ type: 'richText', lexicalBlocks: [{ slug: 'hero' }, { slug: 'callToAction' }] }`.
- **Inline lexical blocks are registered into the shared blocksBySlug**: passing the same inline `Block` object in a lexical `BlocksFeature` and later calling `getBlockSchema('hero')` succeeds.
- **richText without BlocksFeature emits neither key**: assert `lexicalBlocks` and `lexicalInlineBlocks` are undefined (not `[]`).

### `system-prompt.test.ts`

- New bullet appears only when `config.blocks` has entries.

## Non-goals

- **Not a block authoring/editing tool.** The agent uses `create` / `update` with `data` that includes blocks — no separate `addBlock` tool. These schema tools exist so the agent knows _what_ to put into that `data`.
- **No runtime validation of block data.** Payload's own validation is authoritative; the agent should not try to precheck.
- **No dedicated tool for a single lexical field's allowed blocks.** That's already covered by `getCollectionSchema` + the new `lexicalBlocks` keys on the field schema.
- **No caching.** `config.blocks` is in memory already; resolution is trivial.

## Open questions / decisions

- **Label translation.** `labels` can be a function or an i18n record. `listBlocks` should surface the raw value and let the agent treat it as opaque — do not try to resolve `t()` server-side. Confirm by reading one real config.
- **Inline blocks on `FieldSchema.lexicalInlineBlocks`.** Naming: `lexicalInlineBlocks` is verbose but unambiguous. Alternative: fold into a single `lexicalBlocks: { slug, inline?: true }[]` to keep the shape flat. Decision: keep them separate — they're addressed by different lexical nodes (`BlocksNode` vs `InlineBlocksNode`) and the agent needs to know which is which when composing content.
- **Tool naming.** `listBlocks` / `getBlockSchema` mirror `listEndpoints` / `getCollectionSchema`. Confirmed to match existing convention.
