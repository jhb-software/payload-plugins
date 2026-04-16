---
title: Custom system instructions
description: Allow users to provide their own system instructions or extend the default ones from the chat UI
type: feature
readiness: draft
---

## Problem

Currently only the plugin consumer (developer) can customize the system prompt via the `systemPrompt` option in the plugin config. End users in the admin panel have no way to provide their own instructions — e.g. "always respond in German", "use formal tone", or "when creating blog posts, always set the status to draft".

## Proposal

Add a user-facing system instructions field in the chat UI that gets appended to the auto-generated system prompt.

### Scope

There are two levels of custom instructions:

| Level        | Set by    | Persisted in                          | Applies to                   |
| ------------ | --------- | ------------------------------------- | ---------------------------- |
| Plugin-level | Developer | Plugin config (`systemPrompt` option) | All users, all conversations |
| User-level   | End user  | User preferences or per-conversation  | That user's conversations    |

The plugin-level `systemPrompt` option already exists. This plan adds user-level instructions.

### UI changes

- Add a "System instructions" text area accessible from the chat view (e.g. via a settings icon in the header)
- The instructions are visible and editable at any point during a conversation
- Show a subtle indicator when custom instructions are active

### Persistence

Two options for where to store user instructions:

1. **Per-conversation** — stored on the `chat-conversations` document. Each conversation can have different instructions. Simplest to implement.
2. **Per-user default + per-conversation override** — store a default in user preferences, allow overriding per conversation.

Start with option 1 (per-conversation). User-level defaults can be added later.

### Prompt assembly order

The final system prompt is assembled as:

1. Plugin-level `systemPrompt` (developer-provided prefix)
2. Auto-generated schema and rules (collections, globals, localization, custom endpoints)
3. User-level instructions (end-user provided)

User instructions come last so they can override tone/behavior without conflicting with the schema context.

### Implementation

- Add an `instructions` field to the `chat-conversations` collection
- The chat UI sends the instructions with each request (or the server reads them from the conversation document)
- The server appends them to the system prompt under a `## User Instructions` section
