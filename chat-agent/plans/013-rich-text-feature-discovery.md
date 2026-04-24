---
title: Rich-text feature discovery in schema tools
description: Surface the enabled lexical features of every `richText` field in the extracted schema so the agent knows which node types (headings, lists, links, blocks, …) it may emit when generating rich-text content.
type: tool
readiness: ready
---

> **Scope & sequencing.** Ships as a follow-up PR after [`012-block-schema-tools.md`](./012-block-schema-tools.md) lands. Depends on `getBlockSchema` existing (it resolves the block slugs this plan surfaces under `lexical.options.blocks.slugs`). This plan does **not** require any changes to plan 012's code — it only extends `FieldSchema` and updates `extractFields` + `system-prompt.ts`.

## Problem

Lexical rich-text fields in Payload are configured per-field with a `features` array (`HeadingFeature`, `BoldFeature`, `LinkFeature`, `BlocksFeature`, `UploadFeature`, etc.). The allowed node/mark set is **not** uniform across a project: one field may allow `h1`–`h6` + lists + links, another may only allow inline marks, a third may allow blocks of a specific subset of slugs.

Today `extractFields` in `schema.ts` emits `{ name, type: 'richText' }` and stops. The agent therefore has no way to know:

- whether headings are allowed, and which levels (`HeadingFeature({ enabledHeadingSizes })`)
- whether lists, links, uploads, horizontal rules, indents, blockquotes, code, alignment, etc. are enabled
- what the allowed `headingSizes`, `link.fields`, `upload.collections`, `blocks` / `inlineBlocks` slugs, `relationship` collections are

Without this, the model is forced to guess. It will either:

1. produce lexical JSON that the editor's validators reject, or
2. play it safe and emit only paragraphs + text, losing fidelity the schema actually permits.

## Proposal

### Per-field `lexical` summary on `FieldSchema`

Extend `FieldSchema` in `schema.ts` with an optional `lexical` object emitted only for `field.type === 'richText'`:

```ts
interface FieldSchema {
  // …existing keys…
  lexical?: {
    /** All feature keys present on this field's editor, e.g. ['heading','bold','link','blocks']. */
    features: string[]
    /** Per-feature constraints worth telling the agent about. Keys are feature keys. */
    options?: {
      heading?: { enabledHeadingSizes?: ('h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6')[] }
      link?: {
        enabledCollections?: string[]
        disabledCollections?: string[]
        fields?: FieldSchema[] // custom link fields, run through extractFields when the sanitized shape is an array
      }
      upload?: { collections: string[] }
      blocks?: { slugs: string[] }
      inlineBlocks?: { slugs: string[] }
      relationship?: { enabledCollections?: string[]; disabledCollections?: string[] }
      // open-ended — additional feature-specific options can be added in follow-ups
    }
  }
}
```

Design notes:

- **One `lexical` key per field**, not several top-level `lexical*` siblings.
- **Slugs only for blocks / inlineBlocks**, no nested field trees — the agent resolves slugs via `getBlockSchema` (from plan 012).
- **Open-ended `options` map.** Only the allow-list of known keys gets a typed projection. Unknown keys still appear in `features` (so the agent knows they exist) but get no `options` entry.
- **Omit `lexical` entirely** if the field is not a lexical editor or no feature keys are detected. Do not emit `{ features: [] }`.

### Detection strategy

Lexical's sanitized config exposes features under one of two shapes depending on Payload internals:

1. `field.editor.features` — array of `{ key, serverFeatureProps?, clientFeatureProps? }`.
2. `field.editor.resolvedFeatureMap` — `Map<key, ResolvedServerFeature>` where each value carries `serverFeatureProps` / similar.

The extractor normalizes these to a single iterable of `{ key, props }` entries:

1. If `field.editor?.features` is an array → walk it, taking `serverFeatureProps ?? props ?? {}` as `props`.
2. Else if `field.editor?.resolvedFeatureMap` is a `Map` → walk its entries, same projection.
3. Else → return `undefined` (no `lexical` key).

Detection is **structural** (duck-typed) to avoid a hard dependency on `@payloadcms/richtext-lexical`. Do not throw on unrecognised shapes — return `undefined` and let the caller omit the key.

Only emit feature keys that are **actually present** on the editor. Do not emit implicit/default keys like `paragraph` or `text`.

### System-prompt update

Replace the existing lexical-blocks bullet (added by plan 012) with a more general one:

> For every `richText` field in a schema, inspect `lexical.features` and `lexical.options` to see which node types you may emit. Only produce nodes whose feature key appears in `features`. For `blocks` / `inlineBlocks`, the slugs in `options.blocks.slugs` / `options.inlineBlocks.slugs` are exhaustive — call `getBlockSchema({ slug })` to inspect a block's fields before composing it.

Gate on at least one schema already produced for the prompt having a `richText` field with a non-empty `lexical.features`. Compute from the generated schemas; don't re-traverse `config`.

## Implementation

### 1. `schema.ts`

- Extend `FieldSchema` with the `lexical` shape above.
- Add a helper `extractLexicalSummary(field, blocksBySlug): FieldSchema['lexical'] | undefined`:
  - Normalize `field.editor.features` / `resolvedFeatureMap` into `{ key, props }[]` (see Detection strategy).
  - Build `features` = sorted, deduped list of keys.
  - For each known key, project `props` into `options[key]` per the rules below. Unknown keys produce no `options` entry.
  - Return `undefined` if no features were detected.
- In `extractFields` (currently at `schema.ts:73` onward), when `field.type === 'richText'`, call the helper with the same `blocksBySlug` map and assign the result to `schema.lexical` (only if defined).

Per-feature projection rules (locked):

- **`heading`** → `{ enabledHeadingSizes }` copied from `props.enabledHeadingSizes` if it's an array of strings; omitted otherwise. Do not infer a default set.
- **`link`** →
  - `enabledCollections` / `disabledCollections`: copy through when each is `string[]`.
  - `fields`: if the sanitized config exposes `props.fields` as a plain array of Payload fields, run it through `extractFields(props.fields, blocksBySlug)` and assign. If `fields` is still a callback or absent, omit the `fields` key. Trust the sanitized output; guard with `Array.isArray` before extracting.
- **`upload`** → `{ collections: Object.keys(props.collections ?? {}) }`. Omit per-collection nested fields; the agent can call `getCollectionSchema(slug)` if it needs them. If `collections` is missing/non-object, omit `upload` entirely.
- **`blocks`** / **`inlineBlocks`** →
  - `{ slugs: string[] }` collected from `props.blocks` (an array where entries may be a `Block` object or a slug string).
  - For each entry that is a `Block` object (has its own `fields`), register it into the caller-provided `blocksBySlug` map so `getBlockSchema` (plan 012) can resolve it later. Do not recurse into the block's fields here.
  - String entries contribute their slug directly.
- **`relationship`** → copy `enabledCollections` / `disabledCollections` through when each is `string[]`.

### 2. `tools.ts`

No new tools. The `lexical` summary rides along on existing `getCollectionSchema` / `getGlobalSchema` payloads. `getBlockSchema` (from plan 012) resolves the slugs surfaced under `lexical.options.blocks.slugs` / `lexical.options.inlineBlocks.slugs`.

### 3. `system-prompt.ts`

- Replace the bullet added in plan 012 with the generalized bullet above.
- Gate: walk the schemas already produced for the prompt and include the bullet if any `richText` field has `lexical.features.length > 0`. Do not re-traverse `config`.
- If plan 012's narrower bullet is still present when this ships, it is removed in the same change — the generalized bullet subsumes it.

## Tests

Test-driven per `CLAUDE.md`.

### `schema.test.ts`

- **Surfaces enabled feature keys (sorted, deduped).** A richText field configured with `[BoldFeature, ItalicFeature, HeadingFeature, LinkFeature]` produces `lexical.features` containing all four keys in sorted order.
- **Surfaces `heading.enabledHeadingSizes`.** `HeadingFeature({ enabledHeadingSizes: ['h2','h3'] })` → `lexical.options.heading.enabledHeadingSizes` deep-equals `['h2','h3']`.
- **Omits `heading.enabledHeadingSizes` when not provided.** `HeadingFeature()` with no props → `lexical.features` contains `'heading'`, `lexical.options.heading` is either absent or `{}`; test the user-visible contract (the key exists in `features`, no inferred default list).
- **Surfaces `link.fields` when sanitized to an array.** `LinkFeature({ fields: [{ name: 'rel', type: 'text' }] })` after sanitization → `lexical.options.link.fields` contains a `{ name: 'rel', type: 'text' }` entry produced by `extractFields`.
- **Omits `link.fields` when still a callback.** If `props.fields` is a function, `lexical.options.link` has no `fields` key (not a serialized function).
- **Surfaces `link.enabledCollections` / `disabledCollections`** when the props carry them.
- **Surfaces `upload.collections` as a slug array.** `UploadFeature({ collections: { media: {...}, docs: {...} } })` → `lexical.options.upload.collections` deep-equals `['media','docs']` (order by `Object.keys`).
- **Surfaces `blocks.slugs` and registers inline `Block` objects into `blocksBySlug`.** `BlocksFeature({ blocks: [{ slug: 'hero', fields: [...] }, 'callToAction'] })` → `lexical.options.blocks.slugs` deep-equals `['hero','callToAction']`; calling `getBlockSchema({ slug: 'hero' })` afterwards resolves successfully via the shared `blocksBySlug`.
- **Surfaces `inlineBlocks.slugs`.** Same behavior as `blocks` for the inline variant.
- **Surfaces `relationship.enabledCollections` / `disabledCollections`** when present.
- **Unknown feature keys appear in `features` without an `options` entry.** A custom feature with `key: 'myThing'` appears in `features` but `lexical.options` has no `myThing` key.
- **No `lexical` key when `editor` is absent.** A `richText` field with no recognisable editor → `schema.lexical` is `undefined` (the key is not emitted).
- **No `lexical` key when no features are detected.** Editor object present but neither `features` array nor `resolvedFeatureMap` Map → no `lexical` key (not `{ features: [] }`).
- **Non-richText fields unchanged.** `text`, `array`, `blocks`, `tabs` produce no `lexical` key.
- **`resolvedFeatureMap` fallback.** A richText field whose editor exposes features only through a `resolvedFeatureMap: Map<...>` (no `features` array) produces the same `lexical.features` list as the equivalent array-form editor.

### `system-prompt.test.ts`

- **New bullet appears when at least one schema has a richText field with `lexical.features.length > 0`.**
- **New bullet is absent when no schema has a richText field, or all richText fields have `lexical === undefined`.**
- **Narrower plan-012 bullet is no longer emitted** once this plan ships (the generalized bullet replaces it).

### `tools.test.ts`

- **`getCollectionSchema` round-trip.** For a real Payload config with a collection containing a richText field, the tool's output surfaces `lexical` on that field with the expected `features` and `options`.

## Non-goals

- Not a runtime validator. Payload's own validation is authoritative; the agent must not pre-check.
- Not a lexical-JSON builder/helper. The agent constructs lexical content from this schema knowledge plus its training.
- Not editor-agnostic. Slate / custom editors are out of scope; the `lexical` key is omitted for them.
- Not a recursive block expander. Block field trees are fetched via `getBlockSchema`.

## Resolved decisions

- **Key name.** `lexical` (not `richText`). The schema ties to one editor; a future non-lexical editor would justify its own key.
- **Feature chattiness.** Emit only keys actually present on `editor.features` / `resolvedFeatureMap`. Do not emit implicit defaults like `paragraph` or `text`.
- **`link.fields` shape.** Trust the sanitized config. If `props.fields` is an array, run it through `extractFields`; if it is a callback or absent, omit the `fields` key. Guard with `Array.isArray`.
- **`upload.collections`.** Slug array only, via `Object.keys(props.collections ?? {})`. Nested per-collection fields belong to `getCollectionSchema`.
- **Minimum Payload version.** `^3.83` (matches `chat-agent/package.json`). Detection walks `editor.features` (array) first, falls back to `editor.resolvedFeatureMap` (Map), returns `undefined` otherwise. Do not throw on unrecognised shapes.
- **Recursive block resolution.** No. Surface slugs only; agent calls `getBlockSchema` to drill in.
- **Custom / user-authored features.** Appear in `features[]` without an `options` entry. Correct outcome — agent knows the feature exists; we don't pretend to understand its props.
- **Inline `Block` registration.** `extractLexicalSummary` mutates the caller-provided `blocksBySlug` to fold inline blocks into the shared map (same trick `extractFields` already uses for `blockReferences`). This lets `getBlockSchema` resolve inline-only slugs.
- **Sequencing.** Ships after plan 012. Requires no changes to plan 012's tools; only extends `FieldSchema` and the extractor.

## Changelog

Add one `## Unreleased` → `### Added` (or `feat:` bullet) entry to `chat-agent/CHANGELOG.md`:

> Per-field `lexical` summary on `FieldSchema` (returned by `getCollectionSchema` / `getGlobalSchema`) surfacing enabled rich-text features and their options (heading sizes, link fields, upload collections, block slugs, relationship collections).
