---
title: Access-aware system prompt
description: Filter the slug catalog (collections, globals, upload-enabled collections, blocks) emitted into the system prompt by the requesting user's Payload `read` access, instead of listing everything in the config regardless of who's asking.
type: feature
readiness: idea
---

## Problem

`buildSystemPrompt` (`src/system-prompt.ts`) reads `payload.config.collections`, `.globals`, `.blocks`, and `.localization` directly and emits every slug to the model — regardless of the requesting user's access. The README already calls this out under "Production considerations":

> **Schema is sent to the LLM.** Every collection, global, block, locale, and field option (including `select` labels) is included in the system prompt regardless of the current user's access.

Concrete consequences:

- **Schema leakage.** A reader-only user (or a multi-tenant scope) sees the slug names of collections they can't touch — a confidentiality issue for installs that gate collections like `audit-logs`, `billing`, `internal-notes`.
- **Wasted tokens.** Every chat carries the union of all schemas; users on small surfaces still pay for the prompt of the whole CMS.
- **Confused agent.** The agent gets told `events` exists, tries `find({ collection: 'events' })`, and gets `403`. The user sees a tool-call error instead of "the agent doesn't know about that".
- **Multi-tenant disasters.** A tenant chatting their own data sees every other tenant's collection slugs in the same prompt.

The current design optimises for "essentially static prompt" — the prompt only depends on the config and the mode, both of which are fixed per process. Per-user filtering trades that for accuracy.

## Proposal

Resolve Payload access for the requesting `req` once per `runAgent` call, pass the result into `buildSystemPrompt`, and filter the slug catalog by what the user can actually read.

### Public-facing change

None — the system prompt is internal. Behaviour change: prompt contents now depend on `req.user`'s access. Documented as an upgrade, not a breaking API.

### Resolution flow

```
runAgentImpl(req, opts)
  ├─ const access = await resolveAccess(req)              ← new
  └─ const prompt = buildSystemPrompt(
        req.payload.config,
        pluginOptions.systemPrompt,
        hasCustomEndpoints,
        mode,
        access,                                            ← new
      )
```

`resolveAccess(req)` is a thin wrapper around Payload's existing access machinery (`payload.auth({ headers })` + `getAccessResults`, or the equivalent canonical helper — picked at implementation time after a quick survey of what's exported in 3.84+). It returns a structured map:

```ts
type ResolvedAccess = {
  collections: Record<
    string,
    {
      create: boolean
      delete: boolean
      read: boolean | { where: Where } // `Where` = partial access
      update: boolean
    }
  >
  globals: Record<string, { read: boolean; update: boolean }>
}
```

`overrideAccess: true` runs short-circuits to "everything allowed" without calling Payload's access functions. Unauthenticated runs (`overrideAccess: true + !req.user`) get the same.

### Filtering rules

| Surface                 | Included in prompt when                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| Collection slug catalog | `access.collections[slug].read !== false` — boolean-true OR a `Where` constraint |
| Global slug catalog     | `access.globals[slug].read !== false`                                            |
| Upload-enabled list     | Same as collection catalog (derived from accessible collections)                 |
| Blocks (config.blocks)  | Block is referenced from at least one accessible collection/global field tree    |
| Localization (locales)  | Always — locales aren't access-controlled                                        |
| Custom endpoints        | Endpoint's existing `custom.access` (if present); else left as-is                |

`Where`-constrained read is treated as "include the slug" — the user has partial access; surfacing the slug is correct so the agent knows it can attempt reads (which Payload then constrains via the `Where`).

### Tool surface follow-through

A filter that hides slugs from the prompt but leaves them in the tool surface defeats itself: the agent learns about `audit-logs` from a stray mention in user messages, calls `getCollectionSchema({ slug: 'audit-logs' })`, and gets the schema anyway. To close the loop:

- `getCollectionSchema({ slug })`: return `{ error: "Unknown collection slug" }` (not "Access denied" — same response shape as a typo, no information leak) when the slug isn't in `access.collections` or its `read` is `false`.
- `getGlobalSchema({ slug })`: same.
- `find` / `findByID` / `count` etc.: already hit Payload access at runtime — no change needed; Payload returns its standard error and the agent sees it.

### Caching

One `resolveAccess` call per `runAgent` invocation is fine — Payload's access fns may hit DB but the cost is bounded and the prompt is built once. Don't cross-request cache: access can change (role flip, tenant switch) and the staleness window would make debugging miserable.

## Non-goals

- **Field-level access.** Payload's field-level access (sensitive fields within an otherwise-readable collection) is a separate problem with its own complexity (read vs. write per field, conditional `admin.condition`). Defer until a consumer asks.
- **Filtering inside lexical features / block-option projections.** A user who can read a collection sees its full lexical feature summary. Tightening that requires walking the field tree per access result; not worth the complexity for the MVP.
- **Per-request prompt cache.** The prompt build is already a couple of millis; caching it adds invalidation logic for a sub-1% win.
- **Filtering the model selector / mode list / suggested prompts.** Those are gated by `options.access` and `modes.access` already; this plan touches only the system prompt's slug catalog.

## Resolved decisions

- **What access level to filter on: `read`.** A user with no read access on `events` should see no mention of `events`. Whether they have `update` is reflected in the existing mode filtering on the tool surface, not the prompt's slug list.
- **Where-constrained access counts as "included."** Otherwise tenant-scoped users would see no collections at all, which would be useless.
- **Override semantics.** `overrideAccess: true` short-circuits to "show everything" — matches the existing tool-layer behaviour and is what scheduled audits / superuser mode want.
- **Backward-compat.** `buildSystemPrompt` gains an optional `access?: ResolvedAccess` parameter. When omitted, behaviour is unchanged (show everything) so callers that build the prompt outside `runAgentImpl` (none today, but possible) keep working. `runAgentImpl` always passes it.

## Dev app demonstration

Add a `viewer` role to the dev `users` collection (already has `admin | editor | viewer` defined), wire access funcs on the dev collections so:

- `posts`: readable by all roles
- `categories`: readable by `admin` + `editor`, denied for `viewer`
- A new `internal-notes` collection: readable only by `admin`

Then in the dev app:

- Log in as the seeded admin → open chat → confirm the system prompt (visible via the existing dev devtool, or a new `/api/chat-agent/debug/prompt` endpoint guarded by a flag) lists `posts, categories, internal-notes`.
- Switch to a `viewer` user → confirm the prompt lists only `posts`.
- Switch to an `editor` → confirm `posts, categories` but no `internal-notes`.
- Bonus: the audit-runner service-account run (mode: `read`) sees only what its role permits — useful proof that the headless flow inherits the same filtering.

## Test plan

- `resolveAccess(req)` returns the same shape Payload's canonical helper does; cover the override-true short-circuit (no access fns called).
- `buildSystemPrompt(config, ..., access)` filters the collection slug catalog by `access.collections[slug].read`; same for globals.
- `Where`-constrained read keeps the slug in the catalog.
- Blocks are filtered to those referenced from accessible collection/global field trees (via the existing block-resolution walk).
- Upload-enabled list is derived from the filtered collections, not the raw config.
- `getCollectionSchema({ slug })` for an inaccessible slug returns `{ error }` matching the "unknown slug" shape (not a different error code).
- `runAgentImpl`: with `overrideAccess: true`, `resolveAccess` is not called and the prompt contains all slugs (regression: scheduled audits keep working).
- Integration: a real chat request from a `viewer` user gets a prompt missing the gated slugs; the same request from an `admin` does not.
- Backward-compat: calling `buildSystemPrompt(...)` without the `access` argument returns the existing unfiltered output (smoke test that catches accidental hard-requirement of the new param).

## Related work

- Existing "Production considerations" note in `README.md` flags this as a known limitation; this plan is the path to removing that bullet.
- The `runAgent(req, opts)` primitive — already passes `req` through, so wiring `resolveAccess(req)` is purely additive.
