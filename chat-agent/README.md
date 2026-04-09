# Chat Agent Plugin for Payload CMS

A [Payload CMS](https://payloadcms.com/) plugin that adds an AI chat agent for reading, creating, and updating content. It provides an admin panel chat view where users can interact with their content through natural language, powered by Claude and the Payload Local API.

## Features

- Chat view in the Payload admin panel for managing content through conversation
- Full CRUD operations via natural language (find, create, update, delete documents)
- Schema-aware: the agent automatically knows your collections, globals, and field structure
- Conversation persistence with per-user access control
- Streaming responses using the Vercel AI SDK
- Supports custom endpoints: any endpoint with a `custom.description` is discoverable by the agent
- Configurable access control, model selection, and system prompt
- Superuser mode for bypassing collection-level access control (opt-in)
- Localization-aware: reads and writes localized fields when configured

## Installation

```bash
pnpm add @jhb.software/payload-chat-agent
```

## Setup

Install the plugin and add it to your Payload config:

```ts
import { chatAgentPlugin } from '@jhb.software/payload-chat-agent'

export default buildConfig({
  plugins: [
    chatAgentPlugin({
      apiKey: process.env.ANTHROPIC_API_KEY,
    }),
  ],
})
```

The plugin will register a chat view at `/admin/chat` and a streaming chat endpoint at `/api/chat-agent/chat`.

## Configuration

### Plugin Options

| Option            | Type                           | Required | Description                                                            |
| ----------------- | ------------------------------ | -------- | ---------------------------------------------------------------------- |
| `apiKey`          | `string`                       | No       | Anthropic API key. Falls back to `ANTHROPIC_API_KEY` env var           |
| `model`           | `string`                       | No       | Claude model ID (default: `claude-sonnet-4-20250514`)                  |
| `systemPrompt`    | `string`                       | No       | Custom text prepended to the auto-generated system prompt              |
| `access`          | `(req) => boolean`             | No       | Override the default auth check (default: requires authenticated user) |
| `maxSteps`        | `number`                       | No       | Maximum tool-use loop steps per request (default: 20)                  |
| `superuserAccess` | `boolean \| (req) => boolean`  | No       | Controls who can use superuser mode (`overrideAccess: true`)           |
| `adminView`       | `false \| { path, Component }` | No       | Customize or disable the admin chat view                               |

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

### Superuser Mode

By default, the agent respects the logged-in user's permissions. To allow bypassing access control (e.g. for admin users), configure `superuserAccess`:

```ts
chatAgentPlugin({
  superuserAccess: (req) => req.user?.role === 'admin',
})
```

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

| Field            | Type      | Required | Description                                               |
| ---------------- | --------- | -------- | --------------------------------------------------------- |
| `messages`       | `array`   | Yes      | Conversation messages array                               |
| `model`          | `string`  | No       | Override the model for this request                       |
| `overrideAccess` | `boolean` | No       | Enable superuser mode (requires `superuserAccess` config) |

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
