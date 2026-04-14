# Changelog

## Unreleased

- Fix: chat input textarea now starts at two rows by default, and the send/stop control renders as a centered icon-only button inside the textarea (similar to the ChatGPT prompt), freeing up vertical space and reducing visual clutter.
- Fix: the edit action on user messages is now only shown on the _last_ user message. Editing an earlier user message truncates every assistant reply and user turn that came after it, which was easy to trigger accidentally from the hover action on older turns.
- Fix: chat messages now render text and tool-call parts in their original interleaved order. Previously all text was concatenated at the top of the bubble and all tool calls rendered after it, so the assistant's reply appeared before the tool calls it made earlier in the same turn.
- Fix: the chat admin view now renders inside Payload's `DefaultTemplate`, so the nav sidebar and admin header stay visible on `/admin/chat` (custom admin views are not auto-wrapped by Payload's route resolver). Adds `@payloadcms/next` as a peer dependency.
- Fix: the plugin-level `access` function now gates every chat-agent surface. Previously, setting `access: () => false` still allowed any authenticated user to hit the `/chat-agent/chat/models` endpoint, all conversation CRUD endpoints, and the admin `/chat` view itself. Now a denied access check returns 401 on every endpoint and renders a "Not authorized" message in the admin view.
- Improve mode selector labels to describe behavior ("Read only", "Confirm writes", "Read & write", "Superuser (bypass permissions)") instead of raw mode names.
- **BREAKING**: Make the plugin AI-provider agnostic. The `apiKey` option has been removed and replaced with a required `model` factory of type `(modelId: string) => LanguageModel`. The `@ai-sdk/anthropic` package is no longer a dependency of the plugin — install whichever `@ai-sdk/*` provider you want (Anthropic, OpenAI, Google, Mistral, …) and pass the model instance through the factory. The plugin no longer reads `ANTHROPIC_API_KEY` (or any other key) from `process.env`; configuration must come entirely from the plugin options.

  Migration:

  ```diff
  + import { createAnthropic } from '@ai-sdk/anthropic'
  + const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    chatAgentPlugin({
  -   apiKey: process.env.ANTHROPIC_API_KEY,
      defaultModel: 'claude-sonnet-4-20250514',
  +   model: (id) => anthropic(id),
    })
  ```

  See the README for OpenAI and mixed-provider examples.

- Add file upload instructions to system prompt, directing users to upload files in upload-enabled collections
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
- Add a "Chat Agent" link at the top of the admin nav sidebar (via `beforeNavLinks`) that navigates to the chat view; styled to match Payload's built-in nav links (including active-state indicator), respects the configured `adminView.path`, and can be hidden with the new `navLink: false` option
- Remove support for `adminView: false`; the admin chat view is now always registered (use `navLink: false` to hide the sidebar button instead)
- Nav link is now a server component (`ChatNavLinkServer`) that checks the plugin's `access` function before rendering; users without access do not see the link
- Restore the persisted model selection when resuming a conversation on page reload (previously the model selector snapped back to the default)
- Apply model/mode changes to the next request immediately instead of the transport being cached at mount, which previously caused switching the model mid-conversation to have no effect until a full page reload
- Persist the conversation when a stream errors so the user's message survives a reload and they can retry without retyping (the error itself stays ephemeral)
- feat: textarea input with auto-resize, Shift+Enter for newlines
- feat: stop button to abort streaming responses
- feat: code blocks with language labels and copy-to-clipboard
- feat: collapsible thinking/reasoning sections for assistant messages
- feat: copy message action on hover for assistant messages
- feat: retry/regenerate action for the last assistant message
- feat: edit & re-send for user messages with inline editing
- feat: smart auto-scroll that pauses when the user scrolls up
- feat: scroll-to-bottom floating button when not at the bottom
- feat: suggested prompt chips in the empty state, configurable via `suggestedPrompts` plugin option
- feat: sidebar conversation search/filter
- feat: sidebar conversation rename via double-click
