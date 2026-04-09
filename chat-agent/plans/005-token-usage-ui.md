---
title: Show token consumption in conversation UI
description: Display per-conversation and per-message token usage in the chat view
status: planned
---

## Problem

The stream metadata already includes token counts (`inputTokens`, `outputTokens`, `totalTokens`) per message, and conversations store a `totalTokens` field. But none of this is surfaced to the user.

## Proposal

Show token consumption in the chat UI at two levels:

### Per-message

- Display a small token count below each assistant message (e.g. "1.2k tokens")
- Collapsed by default, expandable to show input/output breakdown
- Show the model used (already in message metadata)

### Per-conversation

- Show total token consumption for the current conversation in the chat header or sidebar
- When the conversation list is visible, show token usage per conversation as secondary info

### Formatting

- Use abbreviated numbers: 1,234 → "1.2k", 1,234,567 → "1.2M"
- Keep it subtle — small text, muted color, not the primary focus

### Integration with token budgets (plan 004)

If token budgets are configured:

- Show remaining budget in the chat header (e.g. "12k / 1M tokens used this month")
- Visual indicator (progress bar or percentage) when approaching the limit
- These come from the `GET /api/chat-agent/usage` endpoint
