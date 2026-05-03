# Changelog

## Unreleased

BREAKING CHANGES:

- feat!: add an `emptyState` plugin option to customize the empty chat screen with a `title`, a markdown `description` (rendered by the same renderer used for assistant messages), and `suggestedPrompts` chips so editors get context for what the agent can and can't do before sending the first message. The previous top-level `suggestedPrompts` option has moved under `emptyState.suggestedPrompts` — rename it in your `chatAgentPlugin({ ... })` invocation to migrate.

OTHER CHANGES:

- feat: add `toolDiscovery` plugin option for Anthropic's [Tool Search Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool). Cuts tool-definition tokens on the prefix substantially; activates only for `claude-*` models, ignored for other providers.
- perf: tighten the system prompt to cut redundant fetches
- perf: tighten the tool definitions
- perf: enable Anthropic prompt caching so multi-step tool-use turns stop re-paying full input tokens for the system prompt, tool definitions, and accumulated tool-result history on every step.
- feat: add `runAgent(req, opts)` so cron-triggered endpoints, Payload tasks, and webhooks can invoke the agent off-HTTP with the same tool / prompt / model machinery the chat endpoint uses. Throws if `req.user` is missing unless the caller passes `overrideAccess: true`.
- feat: pass the resolved `modelId` to the `tools` plugin option so a multi-provider setup can conditionally include provider-native tools (e.g. drop `anthropic.tools.webSearch_*` when the user selects an OpenAI model) instead of sending a tool shape the selected provider would reject at runtime.
- fix: clear the chat error banner when starting a new chat or switching conversations via the sidebar, so an error surfaced on the previous chat no longer carries over to an unrelated one
- fix: scrub orphan `tool_use` / `tool_result` pairs from the converted `ModelMessage[]` after `convertToModelMessages`, so a conversation whose previous turn was interrupted mid tool-run (usage-limit, tab close) can be resumed instead of failing every subsequent request with Anthropic's `tool_use ids were found without tool_result blocks immediately after`. `ignoreIncompleteToolCalls` only covers `input-streaming` / `input-available` parts; stored conversations and adapter-side bugs (vercel/ai#14259, vercel/ai#14379) can still leak orphans past it. This is a defence-in-depth pass that also handles OpenAI reasoning adjacency (vercel/ai#8321) by dropping `reasoning` parts that were paired with a stripped tool-call.
- fix: disable the chat composer (textarea + send button) while a tool-approval card is awaiting Allow / Deny, with an inline hint, so a user can't send a new message that poisons the transcript with an orphan `tool_use` (which the agent would then fail on every subsequent request with `Tool result is missing for tool call toolu_...`). The sanitizer on the server handles transcripts already corrupted by this path — the composer gate is the front-line prevention.

## 0.1.0-beta.4

BREAKING CHANGES:

- feat!: rename the `chat-conversations` collection to `agent-conversations` and the default `chat-token-usage` budget collection to `agent-token-usage`. Existing projects must migrate data or override `createPayloadBudget({ slug: 'chat-token-usage' })` to keep the previous slug.

OTHER CHANGES:

- feat: surface a per-field `lexical` summary on `FieldSchema` (returned by `getCollectionSchema` / `getGlobalSchema`) that lists each `richText` field's enabled lexical features (`bold`, `heading`, `link`, `blocks`, ...) along with typed option projections (heading sizes, link fields, upload collections, block/inlineBlock slugs, relationship collections), so the agent can emit only the node types the editor actually allows.
- feat: add `listBlocks` and `getBlockSchema` tools so the agent can enumerate and inspect globally-declared blocks (`config.blocks`) on demand instead of only seeing them through the collections/globals that reference them.
- feat: surface `endpoint.custom.schema` (query / body / response shapes) through `listEndpoints` so the agent sees each custom endpoint's request/response contract and can construct valid `callEndpoint` calls without trial-and-error.
- feat: add a `tools` plugin option that composes the final toolset the agent sees. Supports user-defined tools (Slack webhooks, Axiom/Vercel log queries, ...) and provider-native ones (`anthropic.tools.webSearch_*`, `openai.tools.webSearch`, `google.tools.googleSearch`, ...) under the same surface.
- feat: show a "Responding…" indicator in the message list while the agent is working on a response but hasn't streamed any output yet, and a shimmer skeleton while conversation history is loading instead of a blank area
- feat: note in the system prompt that Payload uses Lexical for rich text so the agent reads/writes rich-text field values as Lexical editor JSON state instead of HTML or Markdown
- feat: note in the system prompt how Payload's `draft` query flag differs from the `_status` field (the document's actual `'draft'` / `'published'` state) so the agent stops conflating the two
- feat: include the canonical Lexical `SerializedBlockNode` shape in the system prompt when a richText field carries the `blocks` / `inlineBlocks` feature, so agents stop guessing the node structure and failing Lexical validation
- perf: restrict the sidebar conversation list query to `title` + `updatedAt` via `select` so the full `messages` JSON is no longer fetched just to render the list
- perf: index the `user` field on the `agent-conversations` collection so read-access filtering and the sidebar list query no longer require a full scan
- fix: redirect unauthenticated visitors of `/admin/chat` to the login page instead of rendering the admin chrome around a "Not authorized" message
- fix: drop tool calls that never reached a terminal state before forwarding messages to the provider, so resumed conversations with an interrupted tool call no longer fail with `tool_use.input: Input should be a valid dictionary` (or analogous orphan-tool-use errors on other providers)

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
