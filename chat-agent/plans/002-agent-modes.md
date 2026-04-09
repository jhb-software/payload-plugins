---
title: Agent modes and per-mode access control
description: Add operational modes (read/ask/read-write/superuser) with per-mode access control to prevent accidental edits and control who can do what
status: planned
---

## Problem

The agent currently has full CRUD access (within the user's permissions). There is no guardrail against accidental edits — a misunderstood prompt can lead to created, updated, or deleted documents. The `superuserAccess` flag controls privilege escalation, but there is no way to restrict the agent to read-only operations in normal use. There is also no way to limit which users can use which level of access.

## Proposal

### Modes

Introduce agent modes that control which tools are available and how writes are handled:

| Mode         | Behavior                                                       |
| ------------ | -------------------------------------------------------------- |
| `read`       | Write tools removed entirely — agent cannot attempt writes     |
| `ask`        | Write tools available but require explicit user confirmation   |
| `read-write` | Full access, no confirmation required                          |
| `superuser`  | Full access with `overrideAccess: true` (bypasses Payload ACL) |

The `superuser` mode subsumes the current top-level `superuserAccess` option, keeping all permission decisions in one place.

### Plugin configuration

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

- `modes.default` — the mode the agent starts in (default: `ask`)
- `modes.access` — per-mode access functions that determine availability per user
  - If a mode has no access function, it is available to all authenticated users
  - If an access function returns `false`, the mode is hidden from that user
  - `read` should never be restricted (always available)

With the example above:

- Regular editors see `read` and `ask` (no access function = available to all)
- Admins also see `read-write`
- Superadmins also see `superuser`

There is no separate `available` list — the access functions alone determine which modes each user sees.

### Resolving available modes

The server needs to tell the UI which modes the current user can access. This can be done via:

- A `GET /api/chat-agent/modes` endpoint that evaluates all access functions against the current request and returns the list of available modes
- Or by passing the available modes as server component props to the chat view

The chat endpoint validates the requested mode against the user's access before processing.

### UI changes

- Add a mode selector in the chat view header (e.g. a dropdown or segmented control)
- Only show modes the current user has access to (as resolved by the server)
- When in `read` mode, make it clear that write operations are disabled
- When in `ask` mode, write operations show a confirmation before executing
- Switching to `read-write` or `superuser` could show a brief confirmation to reinforce intentionality

### Implementation

- The mode is sent with each chat request (in the request body)
- The server validates the requested mode against `access` for the current user
- Tool filtering based on mode:
  - `read` — only read tools (`find`, `findByID`, `count`, `findGlobal`)
  - `ask` — all tools, but write tool results are held pending until the user confirms
  - `read-write` — all tools, no confirmation
  - `superuser` — all tools with `overrideAccess: true`
- The system prompt reflects the current mode so the agent knows its constraints

### How `ask` mode confirmation works

When the agent calls a write tool in `ask` mode:

1. The tool call and its parameters are streamed to the client as usual
2. The client intercepts write tool calls and shows a confirmation dialog (e.g. "Create document in `posts` — Allow / Deny")
3. On approval, the client sends a follow-up request to execute the write
4. On denial, the agent is told the user declined and can adjust its approach

This keeps the server stateless — the client drives the confirmation flow.

### Access control layers

The mode system unifies all access tiers into a single configuration:

| Layer                  | Controls                               | Enforced by             |
| ---------------------- | -------------------------------------- | ----------------------- |
| Payload access control | Field/document-level permissions       | Payload (always on)     |
| Agent mode             | Which operations the agent can attempt | Plugin (tool filtering) |
| Mode access            | Which users can use which modes        | Plugin (`modes.access`) |

Even in `read-write` mode, the agent still respects the user's Payload permissions. Modes are about preventing accidental edits, not replacing security boundaries. `superuser` is the only mode that bypasses Payload ACL.

### Migration from `superuserAccess`

The current top-level `superuserAccess` option would be deprecated in favor of `modes.access.superuser`. For backward compatibility, if `superuserAccess` is set and `modes` is not, map it automatically:

```ts
// Old
chatAgentPlugin({ superuserAccess: (req) => req.user?.role === 'admin' })

// Equivalent new
chatAgentPlugin({ modes: { access: { superuser: ({ req }) => req.user?.role === 'admin' } } })
```
