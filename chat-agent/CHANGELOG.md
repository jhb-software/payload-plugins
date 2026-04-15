# Changelog

## Unreleased

- fix: force `data.user` to the authenticated user on conversation create/update via a `beforeValidate` hook so clients cannot create records owned by another user through Payload's default REST
- fix: derive `totalTokens` on conversations from `metadata.totalTokens` of the provided messages instead of accepting a client-supplied value, keeping the aggregate consistent with the message list
- fix: explicitly reset `searchParams` on the forged request used by the `callEndpoint` tool so the chat endpoint's own query string cannot leak through the prototype chain into a custom handler
- fix: forward `req.signal` to `streamText` as `abortSignal` so client disconnects cancel the in-flight LLM call
- docs: add a Production Considerations section covering prompt injection, schema exposure, default access, custom-endpoint opt-in, and the lack of built-in rate limiting
- add optional `budget` plugin option for capping token spend per request, with a `check` primitive called before each chat request and an awaited `record` callback called after. Requests that exceed the budget receive HTTP 429 and a `X-Budget-Remaining` header is set on allowed requests. A `GET /chat-agent/budget` endpoint is registered when a budget is configured.
- add `createPayloadBudget` helper that returns a drop-in `{ budget, collection }` pair persisting usage to a Payload collection, with built-in `'daily'` / `'monthly'` period and `'user'` / `'global'` scope resolvers.

## 0.1.0

- initial release
