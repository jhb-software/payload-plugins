# Changelog

## Unreleased

- feat: add `listBlocks` and `getBlockSchema` tools so the agent can enumerate and inspect globally-declared blocks (`config.blocks`) on demand instead of only seeing them through the collections/globals that reference them.
- feat!: rename the `chat-conversations` collection to `agent-conversations` and the default `chat-token-usage` budget collection to `agent-token-usage`. Existing projects must migrate data or override `createPayloadBudget({ slug: 'chat-token-usage' })` to keep the previous slug.
- feat: add a `tools` plugin option that composes the final toolset the agent sees. The factory receives `{ defaultTools, req }` and returns the full `name -> Tool` map — modeled on Payload's `lexicalEditor({ features: ({ defaultFeatures }) => ... })`. Supports user-defined tools (Slack webhooks, Axiom/Vercel log queries, ...) and provider-native ones (`anthropic.tools.webSearch_*`, `openai.tools.webSearch`, `google.tools.googleSearch`, ...) under the same surface. Classification: tools without an `execute` function (provider-native, server-executed) are treated as reads; everything else defaults to write (excluded in `read`, `needsApproval: true` in `ask`).
- feat: show a "Responding…" indicator in the message list while the agent is working on a response but hasn't streamed any output yet, and a shimmer skeleton while conversation history is loading (initial hydration and sidebar switches) instead of a blank area
- feat: note in the system prompt that Payload uses Lexical for rich text so the agent reads/writes rich-text field values as Lexical editor JSON state instead of HTML or Markdown
- feat: note in the system prompt how Payload's `draft` query flag (versions vs main table, a "latest" flag) differs from the `_status` field (the document's actual `'draft'` / `'published'` state) so the agent stops conflating the two
- perf: restrict the sidebar conversation list query to `title` + `updatedAt` via `select` so the full `messages` JSON is no longer fetched just to render the list
- perf: index the `user` field on the `agent-conversations` collection so read-access filtering and the sidebar list query no longer require a full scan
- fix: redirect unauthenticated visitors of `/admin/chat` to the login page instead of rendering the admin chrome around a "Not authorized" message
- fix: drop tool calls that never reached a terminal state before forwarding messages to the provider, so resumed conversations with an interrupted tool call no longer fail with `tool_use.input: Input should be a valid dictionary` (or analogous orphan-tool-use errors on other providers)
- fix: scrub orphan `tool_use` / `tool_result` pairs from the converted `ModelMessage[]` after `convertToModelMessages`, so a conversation whose previous turn was interrupted mid tool-run (usage-limit, tab close) can be resumed instead of failing every subsequent request with Anthropic's `tool_use ids were found without tool_result blocks immediately after`. `ignoreIncompleteToolCalls` only covers `input-streaming` / `input-available` parts; stored conversations and adapter-side bugs (vercel/ai#14259, vercel/ai#14379) can still leak orphans past it. This is a defence-in-depth pass that also handles OpenAI reasoning adjacency (vercel/ai#8321) by dropping `reasoning` parts that were paired with a stripped tool-call.

## 0.1.0-beta.3

- feat: surface tool-call status in the chat UI (running / failed / denied) and show failed tool error text in a collapsible panel instead of only a colored dot.
- feat: add an in-chat header showing the conversation title with inline rename, and move the mode / model selectors and token counter into it
- feat: make the chat view usable on narrow viewports
- fix: keep streamed messages visible after the first save of a new conversation
- fix: retarget saves to the new conversation id after switching conversations from the sidebar

## 0.1.0-beta.2

- fix: normalize all Payload label shapes (`string`, localized `Record`, `LabelFunction`, `false`) in `getCollectionSchema` / `getGlobalSchema` output instead of emitting `"[object Object]"`.

## 0.1.0-beta.1

- fix: move `@ai-sdk/react` to `dependencies` so consumer builds can resolve it
- fix: move server components to a `/server` sub-export so `payload generate:importmap` no longer crashes on transitive CSS imports
- fix: hide the `chat-conversations` collection from the admin nav
- fix: use `@payloadcms/ui` `Button` throughout the chat UI for consistent admin-panel styling

## 0.1.0-beta.0

- initial beta release
