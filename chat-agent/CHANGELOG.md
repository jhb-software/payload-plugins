# Changelog

## Unreleased

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
- Restore the persisted model selection when resuming a conversation on page reload (previously the model selector snapped back to the default)
- Apply model/mode changes to the next request immediately instead of the transport being cached at mount, which previously caused switching the model mid-conversation to have no effect until a full page reload
- Persist the conversation when a stream errors so the user's message survives a reload and they can retry without retyping (the error itself stays ephemeral)
