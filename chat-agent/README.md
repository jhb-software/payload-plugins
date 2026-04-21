# Chat Agent Plugin for Payload CMS

A [Payload CMS](https://payloadcms.com/) plugin that adds an admin-panel chat view for reading, creating, and updating content through natural language. Schema-aware, streaming, and **provider-agnostic** via the [Vercel AI SDK](https://sdk.vercel.ai/) — Anthropic, OpenAI, Google, Mistral, Bedrock, etc. Multiple providers can be wired up at once with a model selector.

## Installation

```bash
pnpm add @jhb.software/payload-chat-agent @ai-sdk/anthropic
```

Install whichever `@ai-sdk/*` provider package(s) you want to use alongside the plugin.

## Setup

```ts
import { chatAgentPlugin } from '@jhb.software/payload-chat-agent'
import { createAnthropic } from '@ai-sdk/anthropic'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default buildConfig({
  plugins: [
    chatAgentPlugin({
      defaultModel: 'claude-sonnet-4-20250514',
      model: (id) => anthropic(id),
    }),
  ],
})
```

Registers a chat view at `/admin/chat` and a streaming endpoint at `/api/chat-agent/chat`.

Provider API keys are never read from `process.env` by the plugin — pass them explicitly through your `model` factory.

## Configuration

| Option            | Type                                 | Required | Description                                                                                             |
| ----------------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `model`           | `(modelId: string) => LanguageModel` | Yes      | Resolves a model id to a Vercel AI SDK `LanguageModel`. Called once per request with the selected model |
| `defaultModel`    | `string`                             | Yes      | Model id used when no per-request override is provided                                                  |
| `availableModels` | `ModelOption[]`                      | No       | Models the user can choose from in the chat UI (selector shown when 2+ entries)                         |
| `systemPrompt`    | `string`                             | No       | Custom text prepended to the auto-generated system prompt                                               |
| `access`          | `(req) => boolean`                   | No       | Override the default auth check (default: requires authenticated user)                                  |
| `maxSteps`        | `number`                             | No       | Maximum tool-use loop steps per request (default: 20)                                                   |
| `modes`           | `ModesConfig`                        | No       | Agent modes configuration (see below)                                                                   |
| `adminView`       | `{ path, Component }`                | No       | Customize the admin chat view route or component                                                        |
| `navLink`         | `boolean`                            | No       | Show a "Chat" link at the top of the admin nav sidebar (default: `true`)                                |
| `budget`          | `BudgetConfig`                       | No       | Optional token budget (see below)                                                                       |
| `tools`           | `({ req, defaultTools, modelId }) => ToolMap` | No       | Compose the final toolset — add user or provider-native tools, drop defaults, etc. (see below)          |

### Mixing providers

The factory pattern lets you route each model id to the appropriate provider — typically by id prefix:

```ts
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

chatAgentPlugin({
  defaultModel: 'claude-sonnet-4-20250514',
  availableModels: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'gpt-4o', label: 'GPT-4o' },
  ],
  model: (id) => (id.startsWith('claude-') ? anthropic(id) : openai(id)),
})
```

Tool-calling support is per-model, not per-provider. This plugin relies heavily on tool calls — stick to tool-capable models (e.g. `claude-sonnet-4`, `gpt-4o`).

### Agent modes

| Mode         | Behavior                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| `read`       | Write tools removed entirely — the agent cannot attempt writes                |
| `ask`        | Write tools available but require explicit user confirmation before executing |
| `read-write` | Full access, no confirmation required                                         |
| `superuser`  | Full access with `overrideAccess: true` (bypasses Payload access control)     |

```ts
chatAgentPlugin({
  modes: {
    default: 'ask',
    access: {
      'read-write': ({ req }) => req.user?.role === 'admin',
      superuser: ({ req }) => req.user?.role === 'superadmin',
    },
  },
})
```

- `read` is always available and cannot be restricted
- Modes without an access function are available to all authenticated users
- `superuser` requires an explicit access function to be enabled
- Users only see modes they have access to

### Custom endpoints

Any endpoint with a `custom.description` is discoverable by the agent via the `callEndpoint` tool. Optionally attach a `custom.schema` describing the request/response contract (`query`, `body`, `response`) — when present, it's handed to the agent alongside the description so it can construct valid calls without trial-and-error:

```ts
endpoints: [
  {
    path: '/publish/:id',
    method: 'post',
    custom: {
      description: 'Publish a document by ID',
      schema: {
        body: { notify: { type: 'boolean' } },
        response: { id: { type: 'string' }, status: { type: 'string' } },
      },
    },
    handler: async (req) => {
      /* ... */
    },
  },
]
```

`custom.schema` leaves are passed through verbatim — use whatever shape your team already documents endpoints with (plain descriptors, JSON Schema, etc.). Route params like `:id` belong in the path, not the schema.

### Extending or customizing tools

One `tools` factory composes the full toolset the agent sees. It receives the plugin's default tools (the Payload Local API bindings below), the authenticated `req`, and the selected `modelId` for this request, and returns the final `name -> Tool` map. Modeled on Payload's `lexicalEditor({ features: ({ defaultFeatures }) => ... })`: spread `defaultTools` to keep them, omit to drop, and add your own under any name.

```ts
import { anthropic } from '@ai-sdk/anthropic'
import { tool } from 'ai'
import { z } from 'zod'

chatAgentPlugin({
  defaultModel: 'claude-sonnet-4-20250514',
  model: (id) => anthropic(id),
  tools: ({ defaultTools, req }) => ({
    // Keep all the built-ins (`find`, `create`, `getCollectionSchema`, ...)
    ...defaultTools,

    // Provider-native web tools (executed server-side by Anthropic):
    webSearch: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
    webFetch: anthropic.tools.webFetch_20250910(),

    // A custom tool that calls an external service, closing over `req.user`:
    sendSlackMessage: tool({
      description: 'Post a message to the #ops channel via Slack webhook',
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => {
        const res = await fetch(process.env.SLACK_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `${req.user?.email}: ${text}` }),
        })
        return { ok: res.ok, status: res.status }
      },
    }),
  }),
})
```

In a multi-provider setup, gate provider-native tools on `modelId` so they're only sent to a compatible provider — otherwise e.g. OpenAI will reject an Anthropic-native `webSearch_*` tool the moment someone picks `gpt-5-mini`:

```ts
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'

chatAgentPlugin({
  defaultModel: 'claude-sonnet-4-20250514',
  availableModels: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  ],
  model: (id) => (id.startsWith('claude-') ? anthropic(id) : openai(id)),
  tools: ({ defaultTools, modelId }) => ({
    ...defaultTools,
    ...(modelId.startsWith('claude-')
      ? { webSearch: anthropic.tools.webSearch_20250305({ maxUses: 5 }) }
      : { webSearch: openai.tools.webSearch() }),
  }),
})
```

Classification for mode filtering:

- **Provider-native tools** (no `execute` — the provider runs them, e.g. `anthropic.tools.webSearch_*`, `openai.tools.webSearch`, `google.tools.googleSearch` / `google.tools.urlContext`) are treated as reads: available in `read` mode, not gated by `needsApproval` in `ask`. Make sure the configured model actually supports the tool you pass — the provider rejects unsupported combinations at call time, and some tools (e.g. Anthropic's `webFetch_20260209` with dynamic filtering) require specific models. Each provider typically bills web search per call (~$10 / 1k searches) in addition to tokens.
- **User-defined executable tools** (anything with an `execute` function) default to the safe "write" classification: excluded in `read`, gated behind `needsApproval: true` in `ask`, passed through in `read-write` / `superuser`. The plugin can't know the tool's side effects.

The plugin does not merge — what the factory returns is what the agent sees. Omit `tools` entirely to use the defaults. Runnable examples of custom tools (Axiom Logs, Vercel Logs, Slack webhook) live in `chat-agent/dev/src/customTools.ts`.

### Budget limiting

Cap tokens per request with two functions — the plugin stays agnostic about whether you want per-user, per-day, global, or something else:

```ts
chatAgentPlugin({
  budget: {
    // Return remaining tokens. 0 or negative → 429; null → unlimited.
    check: async ({ req }) => 50_000 - (await getUsageToday(req.user!.id)),
    // Awaited after the response completes, with the actual token usage.
    record: ({ req, usage }) => addUsageToday(req.user!.id, usage.totalTokens ?? 0),
  },
})
```

Successful responses carry `X-Budget-Remaining`, and `GET /api/chat-agent/budget` returns `{ remaining }`.

For a ready-made Payload-backed store with `daily`/`monthly` periods and `user`/`global` scopes:

```ts
import { chatAgentPlugin, createPayloadBudget } from '@jhb.software/payload-chat-agent'

const chatBudget = createPayloadBudget({
  limit: 50_000,
  period: 'daily',
  scope: 'user',
})

export default buildConfig({
  collections: [chatBudget.collection /* ... */],
  plugins: [chatAgentPlugin({ budget: chatBudget.budget /* ... */ })],
})
```

Errors from `check`/`record` are not swallowed — a broken usage store fails loudly rather than silently letting unlimited spend through.

## Agent tools

| Tool           | Description                                           |
| -------------- | ----------------------------------------------------- |
| `find`         | Query documents with filters, pagination, and sorting |
| `findByID`     | Get a single document by ID                           |
| `create`       | Create a new document                                 |
| `update`       | Update a document by ID                               |
| `delete`       | Delete a document by ID                               |
| `count`        | Count documents matching a query                      |
| `findGlobal`   | Get a global document                                 |
| `updateGlobal` | Update a global document                              |
| `callEndpoint` | Invoke a custom API endpoint                          |

Additional tools registered via the `tools` option — including provider-native web tools like `webSearch` / `webFetch` — appear alongside these. See [Extending or customizing tools](#extending-or-customizing-tools).

## Production considerations

This plugin is published as a beta. Review these before enabling it in production.

- **Access defaults to any authenticated user.** Without a custom `access`, every signed-in Payload user can use the agent and forward CMS content to your LLM provider. Gate it to specific roles in real deployments.
- **Prompt injection.** The agent reads arbitrary CMS content — including user-submitted content. Untrusted content can attempt to override the system prompt. `ask` mode requires confirmation before writes; `read-write` and `superuser` do not. Keep untrusted installs on `ask` or `read`.
- **Schema is sent to the LLM.** Every collection, global, block, locale, and field option (including `select` labels) is included in the system prompt regardless of the current user's access.
- **`custom.description` is the opt-in for `callEndpoint`.** A plugin that adds one will automatically expose that endpoint to the agent. Audit before publishing, and prefer endpoints that re-check access inside their handler.
- **Usage tracking on conversations is not authoritative.** `totalTokens` round-trips through the client and isn't trustworthy for billing. Use `budget.record` for anything audit-grade.

## Roadmap

> **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
