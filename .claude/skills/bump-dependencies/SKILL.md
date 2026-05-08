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
