# Changelog

## Unreleased

- fix: keep streamed messages on screen after the first save of a new conversation (the AI SDK's chat instance was being recreated empty when `chatId` flipped from `undefined` to the server-assigned id, so the UI fell back to the empty new-chat state even though the URL retained the conversation id)

## 0.1.0-beta.2

- fix: normalize all Payload label shapes (`string`, localized `Record`, `LabelFunction`, `false`) in `getCollectionSchema` / `getGlobalSchema` output instead of emitting `"[object Object]"`.

## 0.1.0-beta.1

- fix: move `@ai-sdk/react` to `dependencies` so consumer builds can resolve it
- fix: move server components to a `/server` sub-export so `payload generate:importmap` no longer crashes on transitive CSS imports
- fix: hide the `chat-conversations` collection from the admin nav
- fix: use `@payloadcms/ui` `Button` throughout the chat UI for consistent admin-panel styling

## 0.1.0-beta.0

- initial beta release
