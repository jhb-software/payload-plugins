---
name: fix-payload-duplicate-deps
description: Fix Payload admin crashes from duplicate `@payloadcms/ui`/`payload`/`react` in the dep graph. Use when a `@payloadcms/ui` hook returns undefined — `Cannot destructure property 'config' of useConfig()`, `useUploadHandlers must be used within UploadHandlersProvider`, or a plugin dev app failing to start with React-context errors.
---

# Fix Payload duplicate-dependency context errors

Two copies of `@payloadcms/ui` (or `payload`/`react`) → provider in copy A, hook reads from copy B → context `undefined`. Fix resolution, not the call site. Ref: https://payloadcms.com/docs/troubleshooting/troubleshooting

## Workflow

1. **Confirm duplication.** In the failing plugin dir:

   ```bash
   grep -E "^\s+'?@payloadcms/ui'?@" pnpm-lock.yaml
   ```

   Two+ entries with different peer-resolution suffixes confirms it. Don't skip.

2. **Find the forking dep.** Diff the suffixes — the dep that differs is forking resolution. Usually `next` (plugin peer-range vs dev app pin), sometimes `react`/`react-dom`/`payload`. Verify: `grep -E "^\s+<dep>@" pnpm-lock.yaml` shows >1 version.

3. **Pin via `pnpm.overrides`.** Read `<plugin>/dev/package.json` for the version the dev app pins, then add to the plugin's `package.json`:

   ```json
   "pnpm": { "overrides": { "<dep>": "<dev-app-version>" } }
   ```

   Safe to ship — pnpm ignores `overrides` in transitive deps.

4. **Reinstall** (ask user):

   ```bash
   rm -rf node_modules dev/node_modules dev/.next && pnpm install
   ```

5. **Verify.** `grep ... | sort -u` shows one `@payloadcms/ui` entry and one forking-dep version.

## Don't

- Guard the call site against `undefined` — that's the symptom.
- Bump `@payloadcms/ui`/`payload` to dedupe — skew is what forks resolution.
- `pnpm dedupe` first — peer-resolved variants aren't true duplicates.

## Fallbacks

Plugin devDep pinned to dev app's version; `auto-install-peers=false` in `.npmrc`; webpack `resolve.alias` (last resort).
