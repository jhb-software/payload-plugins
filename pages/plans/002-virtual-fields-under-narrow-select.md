---
title: Compute virtual fields under any caller `select`
description: The plugin widens a caller's `select` to cover its own hook dependencies only when a virtual field was explicitly selected. Every other narrow `select` silently computes `path` and `breadcrumbs` from a stripped document.
type: fix
readiness: ready
---

## Problem

`setVirtualFieldsAfterChange` (`hooks/setVirtualFields.ts:89`) computes `path` and `breadcrumbs` from `isRootPage`, `slug`, the parent field and the breadcrumb label field — the list `dependentFields()` returns (`hooks/setVirtualFields.ts:13`).

Payload applies `select` via `afterRead` **before** `afterChange` runs, so those inputs can be missing from the document the hook receives. `selectDependentFieldsBeforeOperation` (`hooks/selectDependentFieldsBeforeOperation.ts:41-79`) exists to prevent that, but every branch is gated on `hasVirtualFieldsSelected` — the caller having explicitly asked for `path` or `breadcrumbs`. A caller who asks for neither gets no widening:

```ts
await payload.update({
  collection: 'pages',
  id,
  data: { title: 'New title' },
  select: { title: true },
})
```

`doc.slug` and `doc.parent` are absent. `setPageDocumentVirtualFields` then throws or computes from nothing, the `catch` at `hooks/setVirtualFields.ts:123-133` logs and falls back to the raw document, and `path` is undefined for every hook that runs afterwards. Nothing surfaces to the caller.

The gate is right for **reads** — a read that did not ask for a virtual field has no reason to pay for one. It is wrong for **mutations**, where `setVirtualFieldsAfterChange` runs unconditionally and its output is written into the response and handed to every downstream `afterChange` hook, regardless of what the caller selected.

Narrow `select` calls are not exotic. They are what REST callers, CLI scripts, migrations and programmatic agents write, and they are the cheapest way to update one field.

The obligation currently lands on the consumer, who must name the plugin's own dependencies in each page collection:

```ts
forceSelect: { slug: true, parent: true, title: true, isRootPage: true },
```

That is plugin knowledge written in consumer code, repeated once per page collection, and it rots: when the plugin gains a dependency, every consumer must notice and edit every collection. Payload's Trash feature shows the failure mode — enabling `trash` introduces a `deletedAt` transition the plugin cares about, and a consumer has to work out that `deletedAt` now belongs in a list it never wanted to maintain.

## Proposal

Extend the mechanism that already exists rather than adding a second one.

### Drop the gate for mutations

In `selectDependentFieldsBeforeOperation`, the widening condition becomes:

- **mutations** (`create`, `update`) — always widen, whether or not a virtual field was selected
- **reads** — unchanged, gated on `hasVirtualFieldSelected`, since `context.generateVirtualFields` correctly stays false otherwise

Both existing select modes keep their handling: `include` adds the missing dependent fields, `exclude` removes their deselection.

### Reuse the strip

The fields the plugin adds are already recorded through `recordAutoSelectedFields` (`utils/autoSelectedFields.ts:13`) and removed from the response by `stripAutoSelectedFieldsAfterOperation` (`hooks/stripAutoSelectedFieldsAfterOperation.ts:17`). Widening for mutations records its additions the same way, so a caller who selected `{ title: true }` still receives only `title`.

This is the whole reason to build here rather than on Payload's collection-level `forceSelect`: `forceSelect` widens unconditionally **and leaks the extra fields into every response**, which is precisely the behaviour the strip hook was just introduced to prevent. The plugin would be reintroducing, permanently and for every read, the problem it just fixed for the conditional case.

### `_status` and `deletedAt`

`dependentFields()` gains `_status` when the collection has drafts enabled and `deletedAt` when it has `trash: true`. Both are inputs to the liveness question — "does this path resolve" — which plan 005 depends on. Adding them to the one dependency list keeps that knowledge in a single place, and the strip hook means neither appears in a response that did not ask for it.

### Not the virtual fields themselves

`path` and `breadcrumbs` are never auto-selected. Whether they are _computed_ stays driven by `context.generateVirtualFields`; this plan only guarantees they _can_ be.

## Consequences

Mutations on page collections read a few extra columns when the caller passed a narrow `select`. Responses are unchanged, because the additions are stripped.

Consumers can delete their hand-written `forceSelect` blocks. Nothing forces them to — a redundant block is harmless — so no migration and no version gate.

This is a prerequisite for plan 005. `pathChanges()` reads `doc` and `previousDoc` from the consumer's hook arguments, which are the same documents a narrow `select` strips. An event cannot carry a path the plugin was unable to compute.

## Dev app demonstration

`dev/src/collections/pages.ts` gains no configuration — the point is that nothing has to be configured.

`dev/src/scripts/narrowSelectUpdate.ts`, runnable from the dev app, updates a nested page's title with `select: { title: true }`, prints the returned document (which must contain `title` and nothing else), then re-reads the document and prints its `path` and `breadcrumbs`. Before the fix the re-read shows a path computed from a stripped document; after, it is correct.

Enabling `admin.enableListViewSelectAPI` on `dev/src/collections/pages.ts` exercises the read side from the admin panel, where the list view narrows `select` to the visible columns.

## Tests

Failing tests land first, per `CLAUDE.md`. `dev/plugin.test.ts` already covers the strip behaviour from the conditional case; these extend it.

**`dev/plugin.test.ts`**

- Updating a nested page with `select: { title: true }` leaves `path` and `breadcrumbs` correct on a subsequent read. Restoring the `hasVirtualFieldsSelected` gate for mutations makes this fail.
- The response to that update contains `title` only — no `slug`, `parent` or `isRootPage`. This is the test that would fail under a `forceSelect` implementation.
- The same update in **exclude** mode (`select: { content: false }`) is equally correct, and the response still excludes only what the caller excluded.
- Creating a page with `select: { title: true }` produces a document that subsequently resolves through `findPageByPath`.
- A **read** with `select: { title: true }` still does not compute virtual fields and does not widen — the read gate is deliberately unchanged.
- On a drafts-enabled collection, a narrow-select update leaves `_status` out of the response while the plugin has seen it.
- On a `trash: true` collection, the same holds for `deletedAt`.
- Relationship population is unaffected: reading a document that populates a page relationship returns the populated page's fields intact, with nothing stripped off it.

**`dev_unlocalized/plugin.test.ts`** — the narrow-select update with localization disabled, covering the non-localized branch of `setPageDocumentVirtualFields`.

**`dev_multi_tenant/plugin.test.ts`** — a narrow-select update on a tenant-scoped page still resolves its parent through `baseFilter`.

## Non-goals

- **No collection-level `forceSelect`.** See above: it leaks the dependent fields into every response.
- **No auto-selection of `path` / `breadcrumbs`.** See above.
- **No new plugin option to disable this.** A toggle would exist only to let an install turn off correctness.
- **No change to what happens when computation genuinely fails.** The `catch` blocks at `hooks/setVirtualFields.ts:72-78,123-133` still log and fall back to the raw document. This plan removes one cause of that fallback, not the fallback.

## Semver

`fix(pages)`, patch bump. No public API changes; responses are unchanged. One `CHANGELOG.md` line: virtual fields are now computed correctly when a create or update passes a narrow `select`.
