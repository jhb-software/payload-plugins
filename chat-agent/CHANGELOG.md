# Changelog

## 0.1.0-beta.9

BREAKING CHANGES:

- fix!: bump the bundled `ai` dependency to v7 and `@ai-sdk/react` to v4. Not a peer dependency, so most installs are unaffected; if your app also imports `ai`/`@ai-sdk/*` directly (e.g. to build custom tools passed via `options.tools`), bump those to matching versions to avoid duplicate-package type conflicts.

OTHER CHANGES:

- fix: drop the UI-only `toolbarInline` and `toolbarFixed` feature keys from a `richText` field's `lexical.features`

## 0.1.0-beta.8

- feat: `update` and `delete` tools now accept a `where` query for bulk operations, mirroring Payload's local API. Pass `id` to target a single document or `where` to update/delete many in one call; `update` also accepts an optional `limit` when using `where`.
- fix: document in the system prompt that the list (`unorderedList`/`orderedList`/`checklist`), `blockquote`, and `horizontalRule` feature keys serialize to different Lexical node types, so the agent stops emitting types that fail `parseEditorState`.

## 0.1.0-beta.7

- feat: `emptyState` accepts a per-request callback `({ req }) => EmptyStateConfig | Promise<EmptyStateConfig>` in addition to a static object, so the empty chat screen can be loaded from a Payload global or varied per tenant.
- feat: allow restricting the `read` mode via `modes.access.read`. Previously `read` was unconditionally available and the access function was ignored.
- fix: accept numeric IDs in the `findById`, `update`, and `delete` tool schemas so Postgres setups (numeric document IDs) stop failing tool calls with a Zod validation error.
- fix: add system prompt guidance for Claude to use `_chatAgentToolSearch` when deferred tool loading hides a needed tool.

## 0.1.0-beta.6

BREAKING CHANGES:

- feat!: `systemPrompt` is now a per-request factory `({ req, defaultPrompt }) => string | Promise<string>` instead of a static string. Wrap `defaultPrompt` to extend, ignore it to replace. Migrate `systemPrompt: 'extra'` → `systemPrompt: ({ defaultPrompt }) => \`${defaultPrompt}\n\nextra\``.

OTHER CHANGES:

- fix: resume a reload-restored approved tool call instead of leaving it displayed as running forever.
- fix: stop the orphan sanitizer from stripping ask-mode tool-calls that are waiting on user approval, which made the next request fail with `AI_ToolCallNotFoundForApprovalError`.
- feat: animate the tool-call status dot and surface an elapsed-second counter while a tool is running

## 0.1.0-beta.5

BREAKING CHANGES:

- feat!: add an `emptyState` plugin option to customize the empty chat screen with a `title`, a markdown `description`, and `starterPrompts` chips. The previous top-level `suggestedPrompts` option has been removed in favor of `emptyState.starterPrompts`.

OTHER CHANGES:

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16
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
