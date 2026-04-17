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
| `customTools`     | `({ req }) => Record<string, Tool>`  | No       | Register extra Vercel AI SDK tools alongside the built-ins (see below)                                  |

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

Any endpoint with a `custom.description` is discoverable by the agent via the `callEndpoint` tool:

```ts
endpoints: [
  {
    path: '/publish/:id',
    method: 'post',
    custom: { description: 'Publish a document by ID' },
    handler: async (req) => {
      /* ... */
    },
  },
]
```

### Custom tools

When you need the agent to call an external service (Slack webhook, Axiom, Vercel Logs, your own Sales API, …) without routing through a Payload endpoint, pass `customTools`. The function is called once per chat request with the authenticated `req` so tools can close over `req.user` / `req.payload`:

```ts
import { tool } from 'ai'
import { z } from 'zod'

chatAgentPlugin({
  defaultModel: 'claude-sonnet-4-20250514',
  model: (id) => anthropic(id),
  customTools: ({ req }) => ({
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

Safety:

- Names must not collide with built-in tool names (`find`, `create`, `update`, …). A collision fails the request with HTTP 500 instead of silently overriding a core tool.
- The plugin can't know a custom tool's side effects, so all custom tools are treated as writes for mode filtering: excluded in `read` mode, gated behind `needsApproval: true` in `ask` mode, and passed through in `read-write` / `superuser`.
- Runnable examples (Axiom Logs, Vercel Logs, Slack webhook) live in `chat-agent/dev/src/customTools.ts`.

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

Additional tools registered via the `customTools` option appear alongside these and follow the same mode rules (see [Custom tools](#custom-tools)).

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
