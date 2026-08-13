---
title: Trash bypasses the parent-deletion guard
description: `preventParentDeletion` is a `beforeDelete` hook, but Payload's Trash feature soft-deletes through `update`. Trashing a parent therefore leaves its children resolving, with breadcrumbs pointing at a document the editor believes is gone.
type: fix
readiness: ready
---

## Problem

Payload 3 ships Trash (`payload/dist/collections/config/types.d.ts:607-615`): a collection with `trash: true` gains an indexed `deletedAt` field, the admin panel's delete action sets that timestamp instead of removing the row, and every read filters trashed documents out by default.

**A soft delete is an `update`.** It runs `beforeChange` / `afterChange` and never reaches `beforeDelete` / `afterDelete`.

`preventParentDeletion` is a `CollectionBeforeDeleteHook` (`hooks/preventParentDeletion.ts:14`, wired at `collections/PageCollectionConfig.ts:140-143`). So on a collection with `trash: true`, the guard the plugin advertises as on-by-default (`types/PagesPluginConfig.ts:37-49`) does not run at all for the delete path an editor actually uses.

Two distinct failures follow.

### 1. Trashing a parent orphans its children silently

The guard exists because MongoDB, SQLite and Postgres as configured here enforce no foreign key constraint on the parent relationship. Trash reopens exactly that hole:

- The children keep their rows and keep resolving through `findPageByPath` — their `path` is computed from stored slugs, not from the parent's liveness.
- `getBreadcrumbs` walks into the trashed ancestor. Because Payload filters trashed documents out of reads by default, the ancestor lookup comes back empty and the breadcrumb chain silently truncates, so a nested page renders a breadcrumb trail missing its middle.
- The editor sees the parent in the Trash view and reasonably believes nothing still references it.

A hard delete of the same document is refused with a clear message. Trashing it succeeds and produces a worse state.

### 2. Trashed children are invisible to the guard

`childDocumentsOf` (`utils/childDocumentsOf.ts:32-43`) calls `req.payload.find` without `trash: true`, so trashed children are filtered out of the very query that decides whether a parent may be deleted. A parent whose only children are trashed is therefore hard-deletable — and restoring one of those children afterwards produces a document whose parent id points at a row that no longer exists. `getBreadcrumbs` then fails for a document that looked fine in the Trash view.

The two failures compose: trash the children, then hard-delete the parent, then restore the children.

## Proposal

### Register the guard on the trash transition

Add a `beforeChange` hook, installed on the same condition as the existing `beforeDelete` entry (`preventParentDeletion !== false`), that detects a document being trashed and runs the same check:

```ts
const isBeingTrashed = data.deletedAt && !originalDoc?.deletedAt
```

On a positive check it calls `childDocumentsOf` and throws the same `AdminPanelError` with the same message. Restoring (`deletedAt` going from set to null) is never blocked.

The message needs one adjustment: it currently reads _"Cannot delete this document…"_. It becomes verb-neutral so the same string serves both entry points, and both stay hardcoded English, matching the plugin's existing error strings.

Guarded, as the delete hook is, on `req.payload.db.packageName` being one of the adapters that lack native foreign key enforcement (`hooks/preventParentDeletion.ts:8-22`).

### Count trashed children

`childDocumentsOf` passes `trash: true` to its `find`, so the query sees trashed rows. A trashed child is still a reference: it can be restored, and until it is purged its parent id is live data.

This changes the behaviour of the existing hard-delete guard too — a parent whose children are all trashed can no longer be hard-deleted. That is the intended correction, and it is a behaviour change that ships with this plan.

### Do not silently swallow query failures

`childDocumentsOf` wraps its query in a `try`/`catch` that warns and continues (`utils/childDocumentsOf.ts:51-53`), which `preventParentDeletion` reads as "no children, safe to delete". A failed query means _unknown_, not _none_, and the consequence is an orphaned subtree.

Plan 001 already removes this `try`/`catch` as part of its change to the same function. If 001 lands first, this plan inherits the removal and only adds `trash: true`. If this plan lands first, the removal happens here and 001 inherits it. Either way it ships once — whichever plan merges first owns it, and the other's description is trimmed in review.

## Consequences

Trashing a parent with children now fails with the same error a hard delete gives. This is the point of the change, but it is a behaviour change for any install that has `trash: true` on a page collection and has been trashing parents successfully — those installs were producing broken breadcrumbs and did not know.

Hard-deleting a parent whose children are all trashed now fails as well.

Both are breaking under `CLAUDE.md`, because previously-succeeding operations now throw.

Installs without `trash` on their page collections see no change whatsoever.

## Dev app demonstration

`trash: true` is added to `dev/src/collections/pages.ts` and `dev/src/collections/country-travel-tips.ts`, so the dev app has a nested page collection with a Trash view.

Clickable in the admin panel:

- Trash a page that has a child travel tip → refused, naming the referencing collection and count.
- Trash the child first, then the parent → still refused, because trashed children count.
- Restore the child, reassign it to another parent, trash the original parent → succeeds.
- Delete permanently from the Trash view with children present → refused, as today.

## Tests

Failing tests land first, per `CLAUDE.md`.

**`dev/plugin.test.ts`**

- Trashing a page that has a child in another page collection is refused, and the child still resolves through `findPageByPath` afterwards (proving the document was not trashed). Removing the `beforeChange` registration makes this fail.
- Trashing a page whose only children are themselves trashed is refused.
- Hard-deleting a page whose only children are trashed is refused — the `trash: true` addition to `childDocumentsOf`. This fails today.
- Restoring a trashed page is never blocked, including when it has children.
- With `preventParentDeletion: false`, trashing a parent succeeds — the option governs both entry points.
- A page with no children trashes and restores cleanly, and resolves through `findPageByPath` again after restore.
- On a collection without `trash: true`, hard-delete behaviour is unchanged.

**`dev_multi_tenant/plugin.test.ts`** — a parent in one tenant is trashable when another tenant holds a same-slug document that is not its child; `baseFilter` still scopes the child lookup.

## Non-goals

- **No cascade.** Trashing a parent does not trash its subtree. Cascading soft-deletes is a much larger commitment (restore semantics, partial restores, ordering) and the plugin's existing stance is to refuse rather than cascade.
- **No change to breadcrumb behaviour for already-orphaned documents.** Installs that trashed parents before this fix keep whatever state they are in; the plugin gains no repair routine. The README notes how to find them (children whose parent id resolves only with `trash: true`).
- **No `trash` awareness in `findPageByPath`.** Payload already filters trashed documents from reads by default, so a trashed page stops resolving without plugin involvement. Pinned by a test here rather than assumed, but no code changes.
- **No path-cache invalidation on trash.** Cached ids are re-fetched with the real filters applied (`queries/findPageByPath.ts:169-186`), so a trashed document's entry fails the re-fetch and is deleted rather than returned.

## Semver

`fix(pages)!` with a `BREAKING CHANGE:` footer, same marker on the PR title, minor bump (pre-1.0). Two `**BREAKING**:` `CHANGELOG.md` lines: trashing a parent with children is now refused, and trashed children now count towards the guard.
