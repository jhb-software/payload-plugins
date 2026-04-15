---
title: Mobile-responsive chat view
description: Make the chat view usable on narrow viewports by collapsing the conversation sidebar into an off-canvas drawer and adapting the chat header for smaller widths.
type: ui
readiness: draft
---

## Problem

The chat view is a fixed two-column layout:

- `Sidebar` has `width: 260px; flex-shrink: 0` in `Sidebar.css:1-8`
- Chat column takes the remaining space, then renders `ChatHeader` / `MessageList` / `ChatInput` inside

On a phone (≤ ~640 px) the 260 px sidebar eats most of the viewport, the chat column becomes unusably narrow, tool-call rows overflow, the `ChatHeader` selects wrap poorly, and the input area gets pinched. There is no way to hide the sidebar — so there's no way to give the chat the full width on mobile.

Goals:

- At desktop widths: layout is unchanged.
- At narrow widths: sidebar is hidden by default; a toggle in the chat header opens it as a drawer overlay; the chat fills the viewport.
- No new dependency.

## Proposal

### Breakpoint

One breakpoint: **`--breakpoint-s`** (Payload sets this; fall back to `768px` via CSS custom property). Above it: current side-by-side layout. Below it: sidebar hidden, opens as a left-edge drawer over the chat.

### Sidebar — off-canvas drawer on narrow viewports

Move Sidebar's layout from inline styles to CSS so it can be media-queried.

Desktop (≥ breakpoint): `position: static; width: 260px; transform: none;` — as today.

Mobile (< breakpoint):

- `position: absolute; inset-block: 0; inset-inline-start: 0; width: min(300px, 85vw); transform: translateX(-100%); transition: transform 180ms;`
- Drawer-open state: `transform: translateX(0);`
- A dimmed backdrop (`position: absolute; inset: 0; background: rgba(0,0,0,0.3)`) only rendered when open, click-to-close.
- Lock body scroll while open (set `overflow: hidden` on the chat-view root).
- `Escape` closes the drawer.

### Chat header — sidebar toggle

New icon button in `ChatHeader`, shown only on mobile via `display: none` + media-query override:

- Icon: a 3-line menu (new `MenuIcon` in `ui/icons/`, Geist-compatible — or reuse `ChevronDownIcon` rotated; prefer a new dedicated icon).
- Aria-label: `"Show conversations"`, toggled to `"Hide conversations"` when open.
- Clicking toggles the drawer state held in `ChatView`.

On mobile the header also loosens layout:

- Let it wrap to two rows (title row + controls row) under a second breakpoint (~480 px) instead of trying to fit everything on one line.
- `Mode` / `Model` labels remain (required by plan 010), they just stack above their selects on very narrow widths.

### State management

A single `sidebarOpen: boolean` in `ChatView`. Default:

- Desktop: `true` (sidebar visible; on desktop this state is effectively ignored because CSS always shows it).
- Mobile: `false` — but since React hydration doesn't know the viewport, do **not** branch the default on `window.matchMedia` server-side. Always default `false`; on desktop the CSS takes over and the sidebar is visible regardless. The boolean only affects the mobile drawer's open/closed translate.

When a conversation is selected on mobile (`onLoad`), auto-close the drawer so the user lands on the chat.

### Message list adjustments

- `MessageBubble` wrapper currently uses `maxWidth: 85%` — fine on mobile.
- Tool-approval card `minWidth: 'min(560px, 100%)'` already graceful.
- `ChatInput` — no width issue expected, but verify the send/stop button doesn't overflow the textarea padding on narrow widths.

## Implementation

### 1. CSS

- Extend `Sidebar.css` with media queries keyed on `(max-width: var(--breakpoint-s, 768px))`. Payload's admin CSS exposes `--breakpoint-s`; we can consume it directly.
- Add `.chat-agent-sidebar--open` modifier class applied only when `sidebarOpen` is true.
- Add `.chat-agent-backdrop` styles (only rendered when open, only visible in mobile media query).
- The chat-view root needs `position: relative` so the absolutely-positioned drawer/backdrop anchor to it.

### 2. New icon

- `ui/icons/MenuIcon.tsx` — three-line Geist icon, copied from `geist-icons` per the project rule (fill="currentColor").

### 3. `ChatView.tsx`

- Add `sidebarOpen` state (default `false`).
- Wrap the two-column area in a `position: relative` div so the drawer overlays it.
- Render `<Sidebar className={sidebarOpen ? 'chat-agent-sidebar--open' : ''} />` — pass `onClose` so the sidebar can close itself on conversation select.
- Conditionally render backdrop: `{sidebarOpen && <div className="chat-agent-backdrop" onClick={() => setSidebarOpen(false)} />}`.
- Add an effect that listens for `Escape` while `sidebarOpen` to close.
- Pass `onToggleSidebar` into `ChatHeader` (enabled only visually on mobile via CSS).

### 4. `Sidebar.tsx`

- Accept an optional `onClose?: () => void` and call it from `onLoad` wrapper.
- Accept a `className` override so `ChatView` can toggle `--open`.

### 5. `ChatHeader.tsx` (from plan 010)

- Render a leading `Button` with `MenuIcon` that calls `onToggleSidebar`.
- CSS: `.chat-agent-header__sidebar-toggle { display: none; }` default, `display: inline-flex` inside the `max-width: var(--breakpoint-s)` media query.

### 6. Tests

- `Sidebar.test.tsx` — add a test that `onClose` fires when a conversation is loaded (only when provided).
- `ChatHeader.test.tsx` — add a test that clicking the sidebar toggle calls `onToggleSidebar`.
- No automated mobile viewport test; rely on manual QA in the dev app at the narrow breakpoint. Document in the PR description.

## Non-goals

- No touch gesture support (swipe-to-open). A button toggle is enough for v1.
- No responsive redesign of the `ToolConfirmation` card — current `minWidth: min(560px, 100%)` is already safe.
- No sidebar persistence across reloads (it resets to closed on mobile every time).

## Open questions / decisions

- **Breakpoint value**: reuse Payload's `--breakpoint-s` (≈ 768 px) vs a chat-specific breakpoint (~640 px). Payload's is the safer default for admin consistency.
- **Toggle placement**: leading icon in `ChatHeader` (proposed) vs a floating FAB vs bottom-sheet on mobile. `ChatHeader` leading icon matches every major chat app; no need to deviate.
- **Desktop behavior**: should the sidebar also be _collapsible_ on desktop (user preference, e.g. to focus on one chat)? Out of scope for this plan — can follow later.
