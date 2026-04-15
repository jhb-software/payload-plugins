---
title: In-chat header with inline rename and labeled selects
description: Move the title / mode / model / tokens out of the admin page header and into a chat-column header; replace native `<select>` with labeled Payload `ReactSelect`; add inline rename on the title.
type: ui
readiness: draft
---

## Problem

Today `ChatView.tsx:249-283` renders a **page-level** header (`<header className="list-header">`) that holds:

- the static "Content Assistant" title and a "New chat" button
- `ModeSelector`, `ModelSelector`, `TokenBadge`

Problems with this layout:

- The title is the same for every conversation. The currently-open conversation has no visible title and no rename affordance (rename lives only inside the sidebar, per-row).
- Mode / Model / Tokens are _global-looking_ (they sit in the admin chrome) but are _per-conversation_ state. That's confusing.
- `ModeSelector.tsx` and `ModelSelector.tsx` use native `<select>` with no `<label>`. No text label, only a `title` attribute on Mode — fails both a11y and Payload visual consistency.

## Proposal

### Layout

Remove the page-level `<header className="list-header">` entirely. `SetStepNav` stays so the admin breadcrumb still says "Chat". Render a new `ChatHeader` component as the first child of the chat column — so it sits inside the chat, above `MessageList`, scrolling with nothing (it pins, list scrolls under it).

```
<div chat column>
  <ChatHeader>                          ← new, flex row, bottom-border separator
    [ title + pencil button ]           ← inline rename; enter/blur saves, esc cancels
    [ spacer ]
    [ label:Mode   ReactSelect ]
    [ label:Model  ReactSelect ]         ← only when availableModels > 1
    [ TokenBadge ]
  </ChatHeader>
  <MessageList />
  <ChatInput />
</div>
```

"New chat" moves to the top of `Sidebar` (above the search input) — conceptually a sidebar action, matches the placement used by Cursor / ChatGPT.

### Payload UI components

- `ReactSelect` (aliased `Select`) — admin-styled combobox. Replaces the native `<select>` in both `ModeSelector` and `ModelSelector`.
- `FieldLabel` — wraps each select with a proper `<label>`. Laid out **left of** the select (not above) so the header bar stays one line tall.
- `TokenBadge` stays as-is; a badge is self-explanatory without a label.

### Rename flow

`ChatHeader` mirrors the existing Sidebar rename:

- Display mode: title text + small `Button buttonStyle="none" size="xsmall" tooltip="Rename"` with the `PencilIcon`.
- Edit mode: swap in a text input focused on mount. Enter/blur commit via `onRename(title)`, Escape cancels. Empty/whitespace title falls back to `"New conversation"`.
- When there is no active conversation yet (no `chatId`), show the title as `"New conversation"` and disable the rename button.

## Implementation

### 1. New `ui/ChatHeader.tsx`

Props:

```ts
type ChatHeaderProps = {
  availableModels: ModelOption[]
  availableModes: AgentMode[]
  defaultModel?: string
  disabled?: boolean
  messages: UIMessage<MessageMetadata>[]
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  onModelChange: (modelId: string) => void
  onRename: (title: string) => void
  selectedModel?: string
  title: string
  canRename: boolean // false while no active chatId
}
```

Internals mirror Sidebar's existing rename machinery (`useState('')`, ref-based focus, `handleRenameSubmit` on Enter/blur, `handleRenameCancel` on Escape).

### 2. Refactor `ModeSelector.tsx` / `ModelSelector.tsx`

- Swap native `<select>` for Payload `ReactSelect`.
- Wrap with `FieldLabel` ("Mode" / "Model") laid out label-left via flex.
- Keep `disabled`, `value`, `onChange` contract unchanged so `ChatView` / `ChatHeader` don't care.
- Update `ModeSelector.test.tsx` / `ModelSelector.test.tsx` — query by `role="combobox"` name rather than native `<select>`. Mock `@payloadcms/ui` like the other UI tests.

### 3. Rewire `ChatView.tsx`

- Compute the current title:
  ```ts
  const currentTitle = conversations.find((c) => c.id === chatId)?.title ?? 'New conversation'
  ```
- Delete `ChatView.tsx:249-283` (the `<header className="list-header">` block).
- Render `<ChatHeader …>` as the first child of the chat column (around the current line ~300, before `<MessageList />`).
- Add `handleRenameCurrent(title: string)` that calls `rename(chatId, title)` when `chatId` is set; no-op otherwise.

### 4. Sidebar

- Add a "New chat" button at the top (above the search input).
- Reuse the existing `newConversation` callback — lift it from `ChatView` into props on `Sidebar`.

### 5. Tests

- `ChatHeader.test.tsx` (new):
  - Shows the title prop when not editing.
  - Clicking the pencil reveals an input pre-filled with the title.
  - Enter / blur calls `onRename` with the trimmed value; Esc does not.
  - Empty trimmed value falls back to `"New conversation"`.
  - Pencil is disabled when `canRename` is false.
- `ModeSelector.test.tsx` / `ModelSelector.test.tsx` — update queries for `ReactSelect`.
- `ChatViewServer.test.tsx` — no behavior change expected.
- `Sidebar.test.tsx` — add coverage for the new "New chat" affordance.

## Non-goals

- No change to the chat agent backend or message shape.
- No redesign of the Sidebar list itself (just the new top action).
- No change to how conversations are persisted — rename still hits `useConversations.rename`.

## Open questions / decisions

- **"New chat" placement**: sidebar top vs header-right vs both? Default: sidebar top.
- **Select label layout**: label above (Payload field default, taller header) vs label-left (compact). Default: label-left.
- **Mobile behavior**: the header is fine to wrap to two lines on narrow widths; no breakpoint work planned for this iteration.
