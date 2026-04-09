---
title: AI SDK UI components and chat UX improvements
description: Improve the chat UI with better input, markdown rendering, scroll behavior, message actions, and polish
status: planned
---

# Chat Agent — UI Improvement Plan

## Current State

| Feature                                | Status | Notes                                                                                |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| Sidebar (list, new, delete, load)      | Done   | `Sidebar.tsx` — uses Payload `Button`, `ConfirmationModal`                           |
| Conversation persistence (save/resume) | Done   | `useConversations.ts`, `use-chat.ts` — REST API CRUD                                 |
| Streaming via AI SDK `useChat`         | Done   | `use-chat.ts` wraps `@ai-sdk/react` `useChat` + `DefaultChatTransport`               |
| Token badge (per-conversation total)   | Done   | `TokenBadge.tsx` — header badge with abbreviated counts                              |
| Per-message token/model metadata       | Done   | `MessageBubble.tsx` — small text below assistant messages                            |
| Tool call indicators                   | Done   | `MessageBubble.tsx` — name, input, status dot (green/yellow)                         |
| Auto-scroll on new messages            | Done   | `ChatView.tsx:79` — `scrollIntoView({ behavior: 'smooth' })` on every message change |
| Auto-focus input after response        | Done   | `ChatInput.tsx:17` — focuses when `isLoading` becomes false                          |
| Error display                          | Done   | `ChatView.tsx:177` — inline error banner                                             |
| Empty state                            | Done   | `MessageList.tsx:19` — "Ask me anything about your content."                         |
| Server-side initial data               | Done   | `ChatViewServer.tsx` — SSR conversations + messages                                  |

**Not yet implemented** (everything below):

---

## Phase 1 — Input & Control Improvements

### 1.1 Textarea with auto-resize

- `ChatInput.tsx` currently uses `<input type="text">` (line 39) — single line only
- Replace with `<textarea>`
- Shift+Enter inserts newline, Enter sends (onKeyDown handler)
- Auto-resize via `scrollHeight` trick (up to ~200px max, then overflow scroll)
- Reset height to single row after send
- Files: `ChatInput.tsx`

### 1.2 Stop button

- `useChat` from AI SDK exposes `stop()` — already available via `use-chat.ts` spread (`...chat`), but not passed to UI
- `ChatView.tsx:76` computes `isLoading` from status but doesn't expose `stop`
- Pass `status` and `stop` to `ChatInput`
- When streaming: render a Stop button (red/secondary style) instead of Send
- Clicking calls `stop()` to abort the stream
- Files: `ChatInput.tsx`, `ChatView.tsx`

---

## Phase 2 — Message Rendering

### 2.1 Markdown rendering

- `MessageBubble.tsx:63-66` renders text parts as plain text with `white-space: pre-wrap`
- Add `react-markdown` + `remark-gfm` as dependencies
- Render assistant text parts through markdown (inline component in `MessageBubble`)
- User messages stay plain text
- Style markdown elements using Payload CSS variables (links, lists, headings, tables)
- Files: `MessageBubble.tsx`, `package.json`

### 2.2 Code blocks with syntax highlighting

- Custom `code` component passed to `react-markdown`
- For fenced blocks: use `react-syntax-highlighter` (or lighter `shiki`) with a theme matching Payload's dark/light mode
- Per-block copy button positioned top-right
- For inline code: simple styled `<code>` element
- Files: new `CodeBlock.tsx` component, `MessageBubble.tsx`, `package.json`

### 2.3 Thinking/reasoning sections

- AI SDK may include `reasoning` parts in message parts array
- Render as collapsible `<details><summary>Thinking...</summary>` block
- Subdued styling (muted text, indented, smaller font)
- Files: `MessageBubble.tsx`

---

## Phase 3 — Message Interactions (hover actions)

### 3.1 Copy message

- On hover over assistant messages, show a copy icon button (top-right of bubble)
- Copies raw text content to clipboard via `navigator.clipboard.writeText()`
- Brief "Copied!" feedback (swap icon or tooltip)
- Files: `MessageBubble.tsx`

### 3.2 Retry / regenerate

- On hover over the **last** assistant message, show a retry icon button
- AI SDK `useChat` exposes `reload()` — already spread from `use-chat.ts`
- Pass `onRetry` callback from `ChatView` to `MessageBubble` (only for last assistant msg)
- Files: `MessageBubble.tsx`, `MessageList.tsx`, `ChatView.tsx`

### 3.3 Edit & re-send (user messages)

- On hover over user messages, show an edit icon button
- Clicking replaces the bubble with an inline textarea pre-filled with the text
- On submit: truncate messages to that point, re-send edited text
- AI SDK `useChat` supports `setMessages()` — already exposed
- Files: `MessageBubble.tsx`, `MessageList.tsx`, `ChatView.tsx`

---

## Phase 4 — Scroll Behavior

### 4.1 Smart auto-scroll

- Current: unconditionally scrolls to bottom on every message change (`ChatView.tsx:78-80`)
- Add `onScroll` handler on the messages container (`MessageList.tsx`)
- Track `isAtBottom` state (compare `scrollTop + clientHeight` vs `scrollHeight`, with ~20px threshold)
- Only auto-scroll when `isAtBottom` is true
- Re-enable when user scrolls back to bottom
- Files: `MessageList.tsx`, `ChatView.tsx`

### 4.2 Scroll-to-bottom FAB

- When `isAtBottom` is false, show a floating button at bottom-center of message area
- Clicking scrolls to bottom and re-enables auto-scroll
- Use Payload `Button` with `icon="chevronDown"` or similar
- Files: `MessageList.tsx`

---

## Phase 5 — Empty State & Guidance

### 5.1 Suggested prompts

- Current: static text "Ask me anything about your content." (`MessageList.tsx:27`)
- Replace with 3–4 clickable suggestion chips
- Clicking sends the suggestion as a message
- Default suggestions based on common CMS tasks (e.g. "List recent drafts", "Summarize content changes")
- Configurable via plugin options (`suggestedPrompts?: string[]`)
- Files: `MessageList.tsx`, `ChatView.tsx`, `src/types.ts`

---

## Phase 6 — Sidebar Enhancements

### 6.1 Rename conversation

- Double-click or edit icon on conversation title in sidebar
- Inline text input for editing
- PATCH to update title via existing REST API
- Files: `Sidebar.tsx`

### 6.2 Search/filter conversations

- Search input at top of sidebar conversation list
- Client-side filter on titles
- Files: `Sidebar.tsx`

---

## Priority Order

| #   | Feature                           | Effort | Impact | Deps                                  |
| --- | --------------------------------- | ------ | ------ | ------------------------------------- |
| 1   | Textarea + Shift+Enter            | Small  | High   | None                                  |
| 2   | Stop button                       | Small  | High   | None                                  |
| 3   | Markdown rendering                | Medium | High   | `react-markdown`, `remark-gfm`        |
| 4   | Smart auto-scroll + FAB           | Medium | High   | None                                  |
| 5   | Copy message action               | Small  | Medium | None                                  |
| 6   | Retry / regenerate                | Small  | Medium | None                                  |
| 7   | Code blocks + syntax highlighting | Medium | Medium | `react-syntax-highlighter` or `shiki` |
| 8   | Suggested prompts                 | Small  | Medium | None                                  |
| 9   | Edit & re-send                    | Medium | Low    | None                                  |
| 10  | Sidebar rename                    | Small  | Low    | None                                  |
| 11  | Sidebar search                    | Small  | Low    | None                                  |
| 12  | Thinking sections                 | Small  | Low    | Model support                         |
