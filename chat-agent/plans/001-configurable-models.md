---
title: Configurable model selection
description: Allow setting a default model and passing a list of available models for users to choose from in the UI
status: planned
---

## Problem

Currently the plugin accepts a single `model` option that sets the Claude model for all requests. There is no way for end users to switch models from the chat UI, and no way for the plugin consumer to restrict which models are available.

## Proposal

Replace the single `model` option with a more flexible configuration:

```ts
chatAgentPlugin({
  models: {
    default: 'claude-sonnet-4-20250514',
    available: [
      { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
      { id: 'claude-opus-4-20250514', label: 'Opus 4' },
    ],
  },
})
```

- `models.default` — the model used when no override is provided (replaces current `model` option)
- `models.available` — list of models the user can choose from in the chat UI
- If only `model` (string) is passed, keep backward compatibility — treat it as default with no selector shown

### UI changes

- Add a model selector dropdown to the chat view (only visible when `available` has more than one entry)
- Persist the user's model choice per conversation

### Validation

- The chat endpoint should reject model IDs not in the `available` list (when configured)
- Keep the per-request `model` override in the request body for programmatic use
