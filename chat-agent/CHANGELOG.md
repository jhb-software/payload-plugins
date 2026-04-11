# Changelog

## Unreleased

- Add configurable model selection via `defaultModel` and `availableModels` options, with a model selector dropdown in the chat UI (shown when 2+ models are available)
- Add markdown rendering for assistant messages using `react-markdown` and `remark-gfm`
- Include admin panel URL patterns in the system prompt so the agent can produce clickable links to documents it creates, updates, or finds (respects `config.routes.admin`)
- Open markdown links in a new tab so clicking through to the admin panel preserves the current chat conversation
- feat: add token budgets and rate limiting — configurable per-user or global token caps with automatic tracking, budget enforcement (HTTP 429), usage API endpoint, and client-side budget warnings
