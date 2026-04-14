# Chat Agent Plugin for Payload CMS

A [Payload CMS](https://payloadcms.com/) plugin that adds an AI chat agent for reading, creating, and updating content. It provides an admin panel chat view where users can interact with their content through natural language, powered by the Payload Local API.

The plugin is **provider-agnostic**: bring your own LLM provider via the [Vercel AI SDK](https://sdk.vercel.ai/) — Anthropic, OpenAI, Google, Mistral, Bedrock, and others all work out of the box. You can also wire up multiple providers at once and let users pick a model from a dropdown.

## Features

- Chat view in the Payload admin panel for managing content through conversation
- Full CRUD operations via natural language (find, create, update, delete documents)
- Schema-aware: the agent automatically knows your collections, globals, and field structure
- Conversation persistence with per-user access control
- Streaming responses using the Vercel AI SDK
- Supports custom endpoints: any endpoint with a `custom.description` is discoverable by the agent
- Configurable access control, model selection, and system prompt
- Agent modes (`read` / `ask` / `read-write` / `superuser`) with per-mode access control
- Localization-aware: reads and writes localized fields when configured

## Installation

```bash
pnpm add @jhb.software/payload-chat-agent
```

## Setup

Install the plugin together with whichever Vercel AI SDK provider package you want to use:

```bash
pnpm add @jhb.software/payload-chat-agent @ai-sdk/anthropic
# or
pnpm add @jhb.software/payload-chat-agent @ai-sdk/openai
```

Then add it to your Payload config and pass a `model` factory that resolves a model id to a `LanguageModel` instance:

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

The plugin will register a chat view at `/admin/chat` and a streaming chat endpoint at `/api/chat-agent/chat`.

> **Heads up — no env-var fallbacks.** The plugin never reads provider API keys from `process.env` itself. Pass them explicitly through your `model` factory so the configuration is fully owned by your Payload config.

## Configuration

### Plugin Options

| Option            | Type                                 | Required | Description                                                                                             |
| ----------------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `model`           | `(modelId: string) => LanguageModel` | Yes      | Resolves a model id to a Vercel AI SDK `LanguageModel`. Called once per request with the selected model |
| `defaultModel`    | `string`                             | Yes      | Model id used when no per-request override is provided                                                  |
| `availableModels` | `ModelOption[]`                      | No       | Models the user can choose from in the chat UI (selector shown when 2+ entries)                         |
| `systemPrompt`    | `string`                             | No       | Custom text prepended to the auto-generated system prompt                                               |
| `access`          | `(req) => boolean`                   | No       | Override the default auth check (default: requires authenticated user)                                  |
| `maxSteps`        | `number`                             | No       | Maximum tool-use loop steps per request (default: 20)                                                   |
| `modes`           | `ModesConfig`                        | No       | Agent modes configuration (see below)                                                                   |
| `adminView`       | `false \| { path, Component }`       | No       | Customize or disable the admin chat view                                                                |

### Using OpenAI

```ts
import { chatAgentPlugin } from '@jhb.software/payload-chat-agent'
import { createOpenAI } from '@ai-sdk/openai'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

chatAgentPlugin({
  defaultModel: 'gpt-4o-mini',
  model: (id) => openai(id),
})
```

### Mixing providers

The factory pattern lets you wire up multiple providers in a single install. Route each model id to the appropriate provider — typically by id prefix:

```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

chatAgentPlugin({
  defaultModel: 'claude-sonnet-4-20250514',
  availableModels: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  model: (id) => (id.startsWith('claude-') ? anthropic(id) : openai(id)),
})
```

> **Tool-calling support is per-model, not per-provider.** This plugin relies heavily on tool calls, so older or smaller models may perform poorly. Stick to tool-capable models (e.g. `claude-sonnet-4`, `gpt-4o`, `gpt-4o-mini`).

### Model Selection

Pass `availableModels` to let users pick a model from a dropdown in the chat view. The selected model is persisted per conversation, and the chat endpoint rejects model IDs not in the list.

```ts
chatAgentPlugin({
  defaultModel: 'claude-sonnet-4-20250514',
  availableModels: [
    { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    { id: 'claude-opus-4-20250514', label: 'Opus 4' },
  ],
  model: (id) => anthropic(id),
})
```

### Custom Endpoints

The agent can discover and invoke custom endpoints defined in your Payload config. Add a `custom.description` to any endpoint to make it available:

```ts
export default buildConfig({
  endpoints: [
    {
      path: '/publish/:id',
      method: 'post',
      custom: { description: 'Publish a document by ID' },
      handler: async (req) => {
        // ...
      },
    },
  ],
})
```

The agent will see these endpoints in its system prompt and can call them via the `callEndpoint` tool.

### Agent Modes

The agent supports four operational modes that control what it can do and how writes are handled:

| Mode         | Behavior                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| `read`       | Write tools removed entirely — the agent cannot attempt writes                |
| `ask`        | Write tools available but require explicit user confirmation before executing |
| `read-write` | Full access, no confirmation required                                         |
| `superuser`  | Full access with `overrideAccess: true` (bypasses Payload access control)     |

Configure which modes each user can use via `modes.access`:

```ts
chatAgentPlugin({
  defaultModel: 'claude-sonnet-4-20250514',
  modes: {
    default: 'ask',
    access: {
      'read-write': ({ req }) => req.user?.role === 'admin',
      superuser: ({ req }) => req.user?.role === 'superadmin',
    },
  },
})
```

- `modes.default` — the mode the agent starts in (default: `'ask'`)
- `modes.access` — per-mode access functions that determine availability per user
  - `read` is always available (cannot be restricted)
  - Modes without an access function are available to all authenticated users
  - `superuser` requires an explicit access function to be enabled

Users only see modes they have access to in the mode selector.

## Agent Tools

The agent has access to the following Payload Local API operations:

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

## REST API Endpoints

### `POST /api/chat-agent/chat`

Streaming chat endpoint. Accepts messages in the Vercel AI SDK format and returns a streaming response.

**Request body:**

| Field      | Type     | Required | Description                                              |
| ---------- | -------- | -------- | -------------------------------------------------------- |
| `messages` | `array`  | Yes      | Conversation messages array                              |
| `model`    | `string` | No       | Override the model for this request                      |
| `mode`     | `string` | No       | Agent mode (`read`, `ask`, `read-write`, or `superuser`) |

### `GET /api/chat-agent/modes`

Returns the list of modes available to the current user along with the configured default mode.

**Response:**

```json
{
  "modes": ["read", "ask", "read-write"],
  "default": "ask"
}
```

### Conversation Endpoints

| Method   | Path                                     | Description               |
| -------- | ---------------------------------------- | ------------------------- |
| `GET`    | `/api/chat-agent/chat/conversations`     | List user's conversations |
| `POST`   | `/api/chat-agent/chat/conversations`     | Create a conversation     |
| `GET`    | `/api/chat-agent/chat/conversations/:id` | Get a single conversation |
| `PATCH`  | `/api/chat-agent/chat/conversations/:id` | Update a conversation     |
| `DELETE` | `/api/chat-agent/chat/conversations/:id` | Delete a conversation     |

## Roadmap

> **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
