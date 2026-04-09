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
- feat: textarea input with auto-resize, Shift+Enter for newlines
- feat: stop button to abort streaming responses
- feat: code blocks with language labels and copy-to-clipboard
- feat: collapsible thinking/reasoning sections for assistant messages
- feat: copy message action on hover for assistant messages
- feat: retry/regenerate action for the last assistant message
- feat: edit & re-send for user messages with inline editing
- feat: smart auto-scroll that pauses when the user scrolls up
- feat: scroll-to-bottom floating button when not at the bottom
- feat: suggested prompt chips in the empty state
- feat: sidebar conversation search/filter
- feat: sidebar conversation rename via double-click
