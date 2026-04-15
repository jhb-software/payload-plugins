---
title: Prompt caching
description: Cache the stable prefix (system prompt + tool definitions) so turns 2+ of a conversation don't re-pay input tokens for data that hasn't changed
type: optimization
readiness: draft
---

## Problem

Every chat request re-sends the full prefix:

```
[ system prompt ][ tool definitions ][ message history ][ new user message ]
       ~600              ~3000              grows              tiny
```

For a "don't respond" opener on a fresh conversation, ~4k input tokens are spent — dominated by tool schemas. Every follow-up message in the same conversation re-pays the same ~3.6k prefix, even though none of it changed.

At 10 turns, that's ~30k redundant input tokens per conversation. Multiply by users and it's the single largest avoidable cost in the plugin.

## Proposal

Mark a cache breakpoint after the stable prefix so providers that support prompt caching bill it at the discounted rate on turn 2+.

### Anthropic (explicit opt-in)

The Vercel AI SDK exposes this via `providerOptions.anthropic.cacheControl`:

```ts
streamText({
  model: resolvedModel,
  system: systemPrompt,
  tools,
  // Tell the AI SDK to put a cache breakpoint after system + tools. The
  // concrete wiring depends on SDK version — either via providerOptions on
  // the system message or a dedicated `cache` option.
  providerOptions: {
    anthropic: { cacheControl: { type: 'ephemeral' } },
  },
  ...
})
```

Billing: cache write costs 1.25× input, cache read costs 0.1× input (90% discount). TTL 5 minutes; a 1-hour tier exists at 2× write cost but isn't needed for interactive chat.

### OpenAI (automatic)

Any prefix ≥1024 tokens is auto-cached — no code changes needed, 50% discount applied by the provider. We get this for free once the prefix is stable.

### Gemini / other providers

Skip for now. Add when a user asks.

## What must stay stable for the cache to hit

- **System prompt** — must be byte-exact. Today `buildSystemPrompt` returns the same string for the same `(config, customPrefix, hasCustomEndpoints, mode)`. Stable within a conversation as long as mode doesn't change.
- **Tool definitions** — `filterToolsByMode` mutates tool shape per mode. Stable within a conversation.
- **Order of prior messages** — already stable; the client resends the full history each turn.

The cache misses if any of:

1. User switches agent mode mid-conversation (prompt + tools both change). Acceptable — mode switches are rare.
2. User edits plugin config (dev reloading the Payload config). Acceptable — dev-time only.
3. Clock rolls past the 5-minute TTL between turns. Acceptable — user is idle; the next turn re-populates.

## Implementation notes

- Single cache breakpoint, placed after tools. Four breakpoints are available on Anthropic — no need for more until we start caching parts of the message history.
- Gate the Anthropic-specific `providerOptions` so it's a no-op for non-Anthropic models. Cleanest: accept an optional `cacheControl?: boolean` on the plugin config, default `true`, and let the user opt out if they have a reason.
- No changes to `buildSystemPrompt` or `buildTools`. The cache is a provider-level concern.
- Look up the exact AI SDK surface for v5 — the provider-options shape changed between SDK versions, and tool-cache support landed later than message-cache support. Verify before shipping.

## Trade-off

**Cost:** cache writes cost 1.25× for the first turn. On conversations that end after a single message, caching is a net loss (~25% more). On two or more turns it's a win; at 10 turns the savings are ~80%.

**Complexity:** one `providerOptions` line in `index.ts`, gated behind a config flag.

## Tests

- A request with caching enabled sets `providerOptions.anthropic.cacheControl` at the expected position. (Unit: inspect the arguments passed to `streamText`.)
- When `cacheControl` is disabled in plugin config, `providerOptions.anthropic` is absent or unset.
- Caching is still applied when the conversation is in `read` mode with a reduced tool set — the cache breakpoint sits after whatever the final tool list is.

Integration-level verification (that the provider actually returns cached-token counts) happens out of band — we don't want tests that talk to Anthropic.

## Out of scope

- Caching parts of the message history (multi-turn user context). Harder because history grows; needs a sliding breakpoint. Revisit if conversations routinely exceed 50 turns.
- Custom TTL / 1-hour tier. Ship with the default 5-minute ephemeral cache.
- Cross-provider unified caching API. Each provider does it differently; wrapping them adds more code than the feature is worth.
