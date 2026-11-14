---
title: Contextual chat drawer
description: Open the chat from anywhere in the admin panel with automatic context about the document currently being viewed
type: feature
readiness: draft
---

## Problem

The chat today lives at a dedicated `/admin/chat` route. A user editing a document — say the `about-us` page — has to either navigate away, or copy-paste the relevant content into a separate chat tab. There is no quick way to say "improve the text of the page I'm looking at" without first telling the agent which document that is and what is in it.

## Proposal

Add a global "Open chat" button in the admin panel that opens the chat in a drawer over the current view. When the drawer is opened from a document edit view (or list view), the agent automatically receives context about which document(s) are in focus.

### UX

- A floating action button (or header icon) is rendered on every admin page.
- Clicking it opens the chat in a right-hand drawer that overlays the current page without navigation.
- The drawer is resizable and can be collapsed/closed without losing the conversation.
- Keyboard shortcut to toggle (e.g. `Cmd/Ctrl+K` or `Cmd/Ctrl+.`).
- Messages, conversation switching, and mode/model selection work identically to the full-page view — the drawer reuses the existing chat UI.

### Context detection

The drawer needs to know what the user is currently looking at. Source this from the URL and Payload admin route params:

| Admin route                           | Context sent to agent                                |
| ------------------------------------- | ---------------------------------------------------- |
| `/admin/collections/:slug/:id`        | `{ kind: 'document', collection, id }`               |
| `/admin/collections/:slug/create`     | `{ kind: 'document-create', collection }`            |
| `/admin/collections/:slug`            | `{ kind: 'list', collection, query }` (list filters) |
| `/admin/globals/:slug`                | `{ kind: 'global', slug }`                           |
| other (dashboard, account, chat view) | `{ kind: 'none' }`                                   |

The context is resolved client-side from `useParams` / `usePathname` and sent with each chat request as a new `context` field alongside `messages`, `conversationId`, `mode`, `model`.

### Unsaved changes

If the user has unsaved edits in the form, the version on disk is stale. Two options:

1. Send only the reference (`collection` + `id`); the agent fetches fresh via the Local API tool calls. Simple, but the agent sees the saved version, not the draft the user is asking about.
2. Also capture the current form state from Payload's form context and include a `draft` payload in the context. The agent then sees exactly what the user sees.

Start with option 1 and add option 2 once the base flow works. Surface a subtle "using last saved version" hint in the drawer when option 1 is active and the form is dirty.

### Server-side context injection

On the server, when a `context` payload is present on a chat request:

- Append a `## Current Context` section to the system prompt describing the active document (collection, id, title if resolvable).
- Pre-resolve the document's title/slug so the agent can reference it naturally ("I've updated the About Us page").
- Do **not** auto-inject the full document body — let the agent fetch it via its existing read tools. This keeps the system prompt compact and reuses the access control already enforced by those tools.

For list views, include the active filters and sort so the agent can reason about "the items currently filtered".

### Scope & permissions

- The button is only rendered when the current user passes the plugin's `access` check — same gate as the dedicated chat view.
- Agent mode (`read` / `read-write` / etc.) is inherited from the conversation, not the surrounding page. Editing a doc does not implicitly grant write permission.

### Implementation sketch

- New `ChatDrawer` client component mounted at the admin root via a Payload `admin.components.providers` or `admin.components.actions` slot.
- Extract the existing chat panel body from `ChatView.tsx` into a shared `ChatPanel` so both the full-page view and the drawer render the same component.
- Add a `context` field to the chat request schema and plumb it through to the system-prompt assembly step.
- Persist the `context` snapshot on the `chat-conversations` message row so re-opening a past conversation shows what the user was looking at when each message was sent.

### Open questions

- Should opening the drawer from a new document start a fresh conversation by default, or continue the most recent one? Leaning fresh, with a "recent conversations" list one click away.
- Should the agent be able to _apply_ edits directly back to the open form (draft update), or only update via save? Out of scope for v1 — keep writes going through the existing tool calls.
