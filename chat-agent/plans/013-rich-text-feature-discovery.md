---
title: Rich-text feature discovery in schema tools
description: Surface the enabled lexical features of every `richText` field in the extracted schema so the agent knows which node types (headings, lists, links, blocks, …) it may emit when generating rich-text content.
type: tool
readiness: discussion
---

## Problem

Lexical rich-text fields in Payload are configured per-field with a `features` array (`HeadingFeature`, `BoldFeature`, `LinkFeature`, `BlocksFeature`, `UploadFeature`, etc.). The set of allowed nodes/marks is **not** uniform across the project: one field may allow `h1`–`h6` + lists + links, another may only allow inline marks, a third may allow blocks of a specific subset of slugs.

Today `extractFields` (`schema.ts:44-145`) emits `{ name, type: 'richText' }` and stops. The agent therefore has no way to know:

- whether headings are allowed, and which levels (`HeadingFeature({ enabledHeadingSizes })`)
- whether lists, links, uploads, horizontal rules, indents, blockquotes, code, alignment, etc. are enabled
- what the allowed `headingSizes`, `link.fields`, `upload.collections`, `blocks` / `inlineBlocks` slugs are

Without this, the model is forced to guess. It will either:

1. produce lexical JSON that contains nodes the editor's validators reject, or
2. play it safe and only emit paragraphs + text, losing fidelity the schema actually permits.

Plan **012** (`012-block-schema-tools.md`) addresses **only** the `BlocksFeature` slice of this problem (it surfaces `lexicalBlocks` / `lexicalInlineBlocks` slugs). This plan generalises that idea to _every_ lexical feature so the agent can compose any allowed node, not just blocks.

## Proposal

### Per-field `lexical` summary on `FieldSchema`

Extend `FieldSchema` with an optional `lexical` object emitted only for `field.type === 'richText'`:

```ts
interface FieldSchema {
  // …existing keys…
  lexical?: {
    /** All feature keys present on this field's editor, e.g. ['heading','bold','link','blocks']. */
    features: string[]
    /** Per-feature constraints worth telling the agent about. Keys are feature keys. */
    options?: {
      heading?: { enabledHeadingSizes: ('h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6')[] }
      link?: {
        enabledCollections?: string[]
        disabledCollections?: string[]
        fields?: FieldSchema[] // custom link fields, run through extractFields
      }
      upload?: { collections: string[] }
      blocks?: { slugs: string[] } // replaces lexicalBlocks from plan 012
      inlineBlocks?: { slugs: string[] } // replaces lexicalInlineBlocks from plan 012
      relationship?: { enabledCollections?: string[]; disabledCollections?: string[] }
      // …add others as we encounter them; keep the map open-ended
    }
  }
}
```

Design notes:

- **One key per field, not many top-level keys.** Avoids polluting `FieldSchema` with a long list of `lexical*` siblings (cf. plan 012's `lexicalBlocks` / `lexicalInlineBlocks`).
- **Slugs only, no nested field trees** for blocks/inlineBlocks — the agent calls `getBlockSchema` (plan 012) to drill in.
- **Open-ended `options`** — we don't try to model every feature exhaustively up front. We surface what we know, ignore what we don't, and grow the map over time.
- **Omit `lexical` entirely** if the field is not a lexical editor or the editor exposes no recognisable features (e.g. a custom editor). Do not emit `{ features: [] }`.

### Detection strategy

Lexical's sanitized config exposes features under several shapes depending on Payload version:

1. `field.editor.features` — array of `{ key, serverFeatureProps?, clientFeatureProps? }`.
2. `field.editor.resolvedFeatureMap` — `Map<key, ResolvedServerFeature>` with `.serverFeatureProps`.
3. Older configs may put props directly on the feature entry.

The extractor should:

1. Build a normalized iterable of `{ key, props }` from whichever shape is present.
2. Collect all keys → `features: string[]` (sorted, deduped).
3. For a small allow-list of "interesting" keys, project `props` into the typed `options[key]` shape above.
4. Unknown keys still appear in `features` (so the agent knows they exist) but get no `options` entry — that's fine.

Keep the detection loose / structural to avoid a hard dependency on `@payloadcms/richtext-lexical`, mirroring the approach in plan 012.

### Folding plan 012 into this plan

Plan 012 introduces `lexicalBlocks` / `lexicalInlineBlocks` as siblings on `FieldSchema`. If both plans land, prefer this plan's nested shape:

```ts
lexical: { features: ['blocks'], options: { blocks: { slugs: [...] }, inlineBlocks: { slugs: [...] } } }
```

…and drop the flat `lexicalBlocks` keys before plan 012 ships. The block-registry tools (`listBlocks`, `getBlockSchema`) from plan 012 are unchanged — they're still how the agent resolves a block slug to its fields.

### System-prompt update

Replace the existing/proposed line about lexical blocks with a more general one:

> For every `richText` field in a schema, inspect `lexical.features` and `lexical.options` to see which node types you may emit. Only produce nodes whose feature key appears in `features`. For `blocks` / `inlineBlocks`, the slugs in `options.blocks.slugs` / `options.inlineBlocks.slugs` are exhaustive — call `getBlockSchema(slug)` to inspect a block's fields before composing it.

Gate this bullet on at least one collection/global having a `richText` field with a non-empty `features` list (avoid noise in configs without lexical).

## Implementation

### 1. `schema.ts`

- Extend `FieldSchema` with the `lexical` shape above.
- Add a helper `extractLexicalSummary(field, blocksBySlug): FieldSchema['lexical'] | undefined`:
  - Normalize `field.editor.features` / `resolvedFeatureMap` into `{ key, props }[]`.
  - Build `features` (sorted unique keys).
  - For each known key, project `props` into `options[key]`. Start with: `heading`, `link`, `upload`, `blocks`, `inlineBlocks`, `relationship`. Add others in follow-ups.
  - For `blocks` / `inlineBlocks`, also fold any inline `Block` objects into `blocksBySlug` so `getBlockSchema` can resolve them (same trick plan 012 uses).
  - Return `undefined` if no features were detected.
- In `extractFields`, when `field.type === 'richText'`, call the helper and assign to `schema.lexical`.

### 2. `tools.ts`

- No new tools required — the data rides along on existing `getCollectionSchema` / `getGlobalSchema` payloads.
- `getBlockSchema` (plan 012) remains the resolver for slugs surfaced in `lexical.options.blocks.slugs`.

### 3. `system-prompt.ts`

- Update the rules block as described above.
- Compute the gate by walking the schemas already produced for the prompt — no extra config traversal.

## Tests

Test-driven per CLAUDE.md.

### `schema.test.ts`

- **Surfaces enabled feature keys**: a richText field configured with `[BoldFeature, ItalicFeature, HeadingFeature, LinkFeature]` produces `lexical.features` containing all four keys, sorted.
- **Surfaces `heading` options**: `HeadingFeature({ enabledHeadingSizes: ['h2','h3'] })` → `lexical.options.heading.enabledHeadingSizes === ['h2','h3']`.
- **Surfaces `link` options including custom fields**: `LinkFeature({ fields: [{ name: 'rel', type: 'text' }] })` → `lexical.options.link.fields` includes a `{ name: 'rel', type: 'text' }` entry produced by `extractFields`.
- **Surfaces `upload.collections`**: `UploadFeature({ collections: { media: {...} } })` → `lexical.options.upload.collections === ['media']`.
- **Surfaces `blocks` slugs and registers inline blocks**: `BlocksFeature({ blocks: [{ slug: 'hero', fields: [...] }] })` → `lexical.options.blocks.slugs` contains `'hero'`, and the block is reachable through the shared `blocksBySlug`.
- **Unknown feature keys appear in `features` without `options`**: a custom feature with `key: 'myThing'` appears in `features` but no `options.myThing` is emitted.
- **No lexical key when editor is absent**: a `richText` field with no recognisable editor produces no `lexical` key (not `{ features: [] }`).
- **Non-richText fields are unchanged**: `text`, `array`, `blocks`, `tabs` produce no `lexical` key.

### `system-prompt.test.ts`

- The new bullet is included only when at least one schema in the prompt has a `richText` field with `lexical.features.length > 0`.

### `tools.test.ts`

- `getCollectionSchema` for a collection containing a `richText` field returns the `lexical` summary on that field (round-trip integration test against a real Payload config used elsewhere in the suite).

## Migration / sequencing vs. plan 012

- Plan 012 and this plan touch the same code path (`schema.ts` lexical detection, `system-prompt.ts` rule bullet).
- Recommendation: merge plan 012 into this plan and ship as a single change. The block-registry tools (`listBlocks`, `getBlockSchema`) from plan 012 stay; the per-field surfacing collapses into the `lexical.options.blocks` / `lexical.options.inlineBlocks` shape proposed here.
- If 012 ships first, this plan becomes a follow-up that:
  1. renames `lexicalBlocks` / `lexicalInlineBlocks` → `lexical.options.blocks.slugs` / `lexical.options.inlineBlocks.slugs`,
  2. adds the other feature projections,
  3. updates the system-prompt bullet.

## Open questions / decisions to discuss

- **How chatty should `features` be?** Do we emit _every_ key (including `paragraph`, `text`, structural defaults), or only the ones that gate optional node types? Suggest: only the feature keys actually present on the editor — let lexical's own defaults (paragraph, text) be implicit.
- **`link.fields` shape.** Lexical link feature accepts a `fields` callback `({ defaultFields }) => Field[]`. Sanitization usually resolves it to the final array — confirm by reading a real config before relying on it.
- **`upload.collections`.** In current Payload, the shape is `{ collections: { [slug]: { fields?: Field[] } } }`. Surface only the slugs; if the agent needs the per-collection extra fields it can call `getCollectionSchema(slug)`.
- **Versions / stability.** Lexical's internal feature-prop shape has changed across Payload minors. Decide on a minimum supported Payload version and add a structural guard that no-ops on older shapes rather than throwing.
- **Naming.** `lexical` (the key) is the most descriptive name but ties the schema to one editor. Alternative: `richText` (mirrors `field.type`). Decision: `lexical` — slate is gone, and any future editor would justify a new key anyway.
- **Should we resolve `BlocksFeature.blocks` recursively here, or rely on `getBlockSchema`?** Recursively expanding risks blowing up the prompt for deeply-nested block trees. Decision: surface slugs only (consistent with plan 012), defer field resolution to `getBlockSchema`.
- **Custom features written by users.** They appear in `features` but we have no schema for their props. That's the right outcome — agent at least knows the feature exists; we don't pretend to understand it.

## Non-goals

- Not a runtime validator. Payload's own validation is authoritative; the agent should not pre-check.
- Not a lexical-JSON builder/helper. The agent constructs lexical content from this schema knowledge plus its training.
- Not editor-agnostic. Slate / custom editors are out of scope; the `lexical` key is omitted for them.
