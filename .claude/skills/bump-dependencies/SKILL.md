---
name: bump-dependencies
description: Run the bundled bump-dependencies.sh to bump plugin dependencies, then walk every non-patch version change to surface breaking changes and apply any plugin-side updates needed. Use when the user says "bump dependencies", "upgrade dependencies", "update dependencies", or wants to refresh a single plugin's dependencies.
---

# Bump plugin dependencies and review breaking changes

Goal: bump the dependencies via the bundled script, then for every non-patch jump confirm the plugin still works against the new version — read the upstream changelog, grep the plugin for affected APIs, and apply fixes.

## Steps

1. **Confirm scope.** Default is all plugins. If the user names one (`bump dependencies for chat-agent`), pass it as the script arg. Refuse to run on a dirty tree — `git status --porcelain` must be empty so the diff in step 3 is meaningful. If dirty, tell the user and stop.

2. **Run the script.** It lives next to this skill so it travels with it. Run it from the repo root:

   ```sh
   ./.claude/skills/bump-dependencies/bump-dependencies.sh [<plugin>]
   ```

   It updates `package.json` + `pnpm-lock.yaml` for the plugin root and every `dev*/` folder, regenerates Payload types/importmap, and smoke-tests the dev server. Don't reimplement any of this — let the script do it. If the script reports `FAILED` for a plugin, stop and surface the error verbatim.

3. **List non-patch bumps.** From the resulting diff, extract every dependency whose new version is a minor or major jump. Patch bumps (`1.2.3 → 1.2.4`) are skipped. Treat `0.x` specially: any change to the `0.<minor>` segment is breaking by semver convention (`^0.5.2 → ^0.6.0` counts).

   ```sh
   git diff --no-color -- '*/package.json' '**/package.json'
   ```

   Parse `"<dep>": "^OLD"` → `"<dep>": "^NEW"` lines. Group by dependency across plugins so a Payload bump (`@payloadcms/ui`, `@payloadcms/next`, `payload`, `@payloadcms/translations`) is reviewed once, not nine times.

4. **For each non-patch bump, read the upstream changelog.** Pick the cheapest source that covers all intermediate versions, not just the new one:
   - **GitHub Releases** — `gh release list -R <owner>/<repo> --limit 30` then `gh release view <tag> -R <owner>/<repo>`. Best for Payload (`payloadcms/payload`), `ai-sdk` (`vercel/ai`), `vitest`, `next`.
   - **`npm view <pkg> --json`** — fallback when the package isn't on GitHub or releases are sparse; `homepage` + `repository.url` give you the next hop.
   - **WebFetch** the package's `CHANGELOG.md` on GitHub when releases are empty (some repos only update CHANGELOG).

   Read every release between OLD and NEW (exclusive of OLD, inclusive of NEW). Look for: `BREAKING`, `breaking change`, `removed`, `renamed`, `deprecated`, peer-dependency changes, behavior changes in APIs the plugin uses.

5. **Grep the plugin for affected APIs.** For each breaking change the changelog calls out, grep the plugin source (`<plugin>/src/`) and the dev app (`<plugin>/dev*/src/`) for the symbol/option/import that changed. If there are no hits, note "not used" and move on. If there are hits, note the file:line and what needs to change.

   Be skeptical of the changelog wording — a "removed" API in v6 may have an alias, a "renamed" option may still be accepted. When the change touches code the plugin uses, verify in the installed package (`<plugin>/node_modules/<pkg>/`) before editing.

6. **Apply needed plugin-side updates.** For each real hit from step 5, edit the plugin source to match the new API. Re-run the plugin's checks:

   ```sh
   pnpm --filter <plugin> typecheck
   pnpm --filter <plugin> test       # if the plugin has tests
   ```

   If the plugin has a dev app touchpoint for the affected feature (per `CLAUDE.md` "Dev App Demonstrations"), exercise it: start the dev server (`PORT=<free-port> pnpm --filter <dev-app> dev`), hit `/admin/login`, and confirm no compile errors. Don't claim it works without seeing it.

7. **Update the affected plugin's `CHANGELOG.md`** only if the upgrade required user-visible plugin changes (a peer-dependency range bumped to a new major, an exported API renamed to track upstream, etc.). A pure version bump with no plugin-side impact is `chore` and gets no entry, per `CLAUDE.md`.

8. **Report back, in this shape:**

   ```
   Upgrade summary

   Script: SUCCESS for <N> plugins / FAILED for <list>
   Non-patch bumps reviewed: <count>

   <dep>  <OLD> → <NEW>  (<plugins affected>)
     Breaking: <one-line summary or "none">
     Plugin impact: <"none — symbol not used"  |  file:line — <what changed>>
     Action: <"no change"  |  "edited <files>"  |  "needs follow-up: <what>">

   <repeat per dep>

   Follow-ups: <list anything you couldn't verify, e.g. "vitest 4.1 → 4.2: changelog mentions snapshot format change; chat-agent has no snapshots, low risk but worth a CI run">
   ```

   Don't commit. The user runs `git commit` themselves so they can review the diff.

## Reconcile `pnpm-workspace.yaml` overrides

The script bumps `package.json` and `pnpm-lock.yaml` but never touches the `overrides:` block in each plugin's `pnpm-workspace.yaml`. Overrides win during resolution, so any dependency pinned there is silently capped — `package.json` shows the new version while the lockfile keeps the old one. After the bump, audit the overrides:

1. **Find the mismatch.** For every dependency that appears in both the bump diff and an `overrides:` block, compare declared vs resolved:

   ```sh
   grep -E "^  <dep>:" <plugin>/pnpm-workspace.yaml      # the pin
   pnpm -C <plugin> list <dep>                            # what actually resolved
   ```

   An exact pin (`next: '16.2.6'`) caps the dep; a `^`-floor (`mongoose: '^8.22.1'`) only sets a minimum and won't block an upgrade.

2. **Bump exact-pin dedup overrides; never remove them.** `next` is pinned to one exact version on purpose: it forces a single `next` (and therefore one React) across the plugin root, the `dev*/` apps, and the `@payloadcms/*` peers. Remove the pin and the `@payloadcms/*` multi-window peer range (`>=16.2.6 <17`) lets a transitive dep pull a second `next`, so the tree resolves two versions at once — the duplicate-deps Payload admin crash (`Cannot destructure property 'config' of useConfig()`; see the `fix-payload-duplicate-deps` skill). Bump the pin to match the new `package.json`, reinstall, and confirm one version remains:

   ```sh
   pnpm -C <plugin> list next | grep -oE 'next@[0-9.]+' | sort -u   # must be a single line
   ```

3. **Audit `^` security floors for redundancy.** A floor exists because some transitive dep once pulled a vulnerable version. Once that dep updates its own range, the floor is dead weight. Test it empirically: strip the floor lines (keep the dedup pins), reinstall every plugin, and compare each package's lowest resolved version to its floor.
   - natural resolution **≥ floor** → redundant, drop the override.
   - natural resolution **< floor** → still load-bearing, keep it (removing it puts a below-floor version back in the lockfile).

   A downward drop after stripping is proof the floor does real work: the pre-strip lockfile held the forced safe version, so re-resolving lower means the natural range sits below the floor. A bump as large as a Payload minor rarely retires a floor — at the 3.84→3.85 bump, even `mongoose` (whose `@payloadcms/db-mongodb` consumer now requires `8.22.1` directly) still resolved `8.15.1` from another consumer, so every floor stayed. Restore the tree with `git stash` (not `git checkout -- .`, which is denied) once measured.

## Heuristics for what to read carefully vs skim

- **Payload core (`payload`, `@payloadcms/*`)** — read every minor's release notes; this repo's plugins live or die by Payload API stability. Pay attention to field-config, plugin API, and admin component prop changes.
- **`next`, `react`, `react-dom`** — peer ranges are intentionally broad (`^15.0.0 || ^16.0.0` for Next). The script already skips collapsing `next`. Skim release notes for peer-dependency implications only.
- **`ai`, `@ai-sdk/*`** (chat-agent) — fast-moving, frequent breaking changes in tool-call / message shape. Read carefully.
- **`zod`** — v3→v4 was breaking; minor bumps within v4 are usually safe. Skim.
- **`@swc/core`, `@types/*`, `prettier`, `rimraf`, `copyfiles`** — tooling, almost never affects plugin behavior. Skim and move on unless the changelog flags something.
- **`vitest`, `jsdom`, `@testing-library/*`** — only matters if tests fail; if tests pass, no review needed.

## When to stop and ask

- Script returns `FAILED` for any plugin → report and stop, don't try to fix it inline.
- A breaking change requires an architectural decision (e.g. Payload removes a hook the plugin depends on) → write up the options and ask before picking one.
- Peer-dependency range needs to widen or narrow to track upstream → confirm with the user; this changes the plugin's public install matrix.
- An exact-pin override (e.g. `next`) needs to cross a major, or a security floor's removal can't be proven redundant by the strip-and-reinstall test → confirm with the user before changing the `overrides:` block.
