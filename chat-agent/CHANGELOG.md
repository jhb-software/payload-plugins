# Changelog

## Unreleased

- Add agent modes (`read`, `ask`, `read-write`, `superuser`) with per-mode access control
- Add `modes` plugin option for configuring available modes and per-user access
- Add mode selector UI in chat view header
- Add `ask` mode with write tool confirmation using the Vercel AI SDK's native `needsApproval` / `addToolApprovalResponse` flow
- Add `read` mode that restricts the agent to read-only tools
- Add `superuser` mode that bypasses Payload access control
- Add `GET /api/chat-agent/modes` endpoint for resolving available modes
- Remove `superuserAccess` option in favor of `modes.access.superuser`
- Add configurable model selection via `defaultModel` and `availableModels` options, with a model selector dropdown in the chat UI (shown when 2+ models are available)
- Add markdown rendering for assistant messages using `react-markdown` and `remark-gfm`
- Include admin panel URL patterns in the system prompt so the agent can produce clickable links to documents it creates, updates, or finds (respects `config.routes.admin`)
- Open markdown links in a new tab so clicking through to the admin panel preserves the current chat conversation
- Add a "Chat" link at the top of the admin nav sidebar (via `beforeNavLinks`) that navigates to the chat view; respects the configured `adminView.path` and can be hidden with the new `navLink: false` option
- Remove support for `adminView: false`; the admin chat view is now always registered (use `navLink: false` to hide the sidebar button instead)
- Nav link is now a server component (`ChatNavLinkServer`) that checks the plugin's `access` function before rendering; users without access do not see the link
