# @jhb.software/payload-chat-agent

## Unreleased

- Add agent modes (`read`, `ask`, `read-write`, `superuser`) with per-mode access control
- Add `modes` plugin option for configuring available modes and per-user access
- Add mode selector UI in chat view header
- Add `ask` mode with client-side write tool confirmation flow
- Add `read` mode that restricts the agent to read-only tools
- Add `superuser` mode that bypasses Payload access control
- Add `GET /api/chat-agent/modes` endpoint for resolving available modes
- Add `POST /api/chat-agent/execute-tool` endpoint for ask-mode tool execution
- Remove `superuserAccess` option in favor of `modes.access.superuser`
