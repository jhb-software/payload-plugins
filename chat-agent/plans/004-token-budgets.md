---
title: Token budgets and rate limiting
description: Cap token usage per user with configurable budgets and persist consumption for tracking and enforcement
status: planned
---

## Problem

There is no limit on how many tokens a user can consume through the chat agent. A single user could rack up significant API costs, either accidentally (long conversations, large result sets) or intentionally. There is also no way to track how much each user has consumed over time.

## Proposal

### Token tracking

Persist token consumption per user in a dedicated collection:

```
chat-token-usage
├── user (relationship)
├── inputTokens (number)
├── outputTokens (number)
├── totalTokens (number)
├── period (text, e.g. "2026-04")
└── timestamps
```

Each row represents a user's usage for a given period (month by default). Updated after every chat response completes, using the token counts already available from the stream metadata.

### Budget configuration

```ts
chatAgentPlugin({
  tokenBudget: {
    period: 'monthly', // 'daily' | 'monthly' (default: 'monthly')
    limit: 1_000_000, // total tokens per user per period
    limitBy: 'user', // 'user' | 'global' (default: 'user')
    resolveLimit: (req) => {
      // optional: per-user limit override
      if (req.user?.role === 'admin') return 5_000_000
      return undefined // fall back to default limit
    },
  },
})
```

- `period` — budget reset interval
- `limit` — default token cap per period
- `limitBy` — whether the limit applies per user or globally across all users
- `resolveLimit` — optional function to return a custom limit for specific users (return `undefined` to use the default)

### Enforcement

- Before processing a chat request, check the user's current period usage against their limit
- If the budget is exhausted, return a clear error (HTTP 429) with a message like "Token budget exceeded. Resets on May 1."
- Include remaining budget in response headers so the client can show warnings as the user approaches the limit

### Budget warning thresholds

The client should warn users as they approach their limit:

| Usage   | Behavior                                             |
| ------- | ---------------------------------------------------- |
| < 80%   | No warning                                           |
| 80–100% | Subtle warning in the UI (e.g. "80% of budget used") |
| 100%    | Chat disabled with clear message and reset date      |

### Implementation

- Add `chat-token-usage` collection (hidden from admin nav, like `chat-conversations`)
- After each streamed response completes, upsert the usage record for the current user + period
- Add a `GET /api/chat-agent/usage` endpoint returning the user's current usage and limit
- The chat endpoint checks budget before processing and returns 429 if exceeded
