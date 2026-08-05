---
name: verify-pr
description: Check out a GitHub PR, identify the plugin it touches, start that plugin's dev app, and tell the user the exact page + steps to exercise the change in the admin panel. Use when the user says "verify PR \#N", "check PR N in the dev app", or similar.
---

# Verify a PR in the dev app

Goal: get the user from "PR number" to "I can click through the change in my browser" with one message back.

## Steps

1. **Read the PR.** `gh pr view <N> --json title,body,headRefName,files` — note the title, the top-level plugin dir under `files[].path`, and the branch.

2. **Check out the branch.** `gh pr checkout <N>`. If the working tree is dirty, stop and tell the user.

3. **Identify the plugin.** Top-level dir owning the changed files (`chat-agent/dev/...` still means `chat-agent`). Multiple plugins → ask which one.

4. **Read `<plugin>/CHANGELOG.md`** for the one-line user-visible summary (usually under `## Unreleased`).

5. **Find the verification path.** From `gh pr diff <N>` and `<plugin>/dev/src/payload.config.ts`, identify the collection/global/route that exercises the change and any new option wired into the dev config. Quote the literal example values from the dev config — they're your concrete inputs.

6. **Start the dev server** in the background from `<plugin>/dev/` with `PORT=<free-port> pnpm dev`. Exception: `chat-agent` hardcodes `--port 3940` in its `dev` script.

7. **Verify `/admin` actually serves.** Next's "Ready" log only means the port is bound; first-request compile can still fail.

   ```sh
   curl -s -o /tmp/verify-pr-admin.html -w "%{http_code}\n" http://localhost:<port>/admin/login
   ```

   Hard-fail if the response is 500, the HTML contains `__next_error__` / `nextjs-portal`, or the dev log shows `Module not found` / `Failed to compile` / `SyntaxError`. Report verbatim and stop. Common fixes after `gh pr checkout`: `pnpm install` (new deps), `rm -rf <plugin>/dev/.next` (stale refs).

   Proceed only on `200` / `307` / `302` to `/admin/login` with a clean log.

8. **Tell the user, in this shape:**

   ```
   PR #<N>: <title>

   Plugin: <plugin-name>
   Branch: <branch>
   Dev server: http://localhost:<port>/admin

   What changed (from PR + changelog):
   <one sentence>

   To verify:
   1. Open <specific URL>
   2. <concrete action — real fields, real buttons>
   3. Expected: <observable result, quoting literal values from the dev config>
   ```

   Real URLs and real fields only. Non-admin surface (API, public page) → give a curl command or public URL. For breaking changes (`feat!` / `fix!`), add a one-line migration note.

9. **Stop.** Don't click through it yourself unless asked.

## When you can't produce concrete steps

Pure refactor or invisible internal change → say so and suggest tests, curl, or generated-types check instead. A `feat` PR with no `dev/` demonstration is a CLAUDE.md violation — flag it rather than inventing steps.
