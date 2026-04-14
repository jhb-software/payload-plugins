# Changelog

## Unreleased

- add optional `budget` plugin option for capping token spend per request, with a `check` primitive called before each chat request and an awaited `record` callback called after. Requests that exceed the budget receive HTTP 429 and a `X-Budget-Remaining` header is set on allowed requests. A `GET /chat-agent/budget` endpoint is registered when a budget is configured.
- add `createPayloadBudget` helper that returns a drop-in `{ budget, collection }` pair persisting usage to a Payload collection, with built-in `'daily'` / `'monthly'` period and `'user'` / `'global'` scope resolvers.

## 0.1.0

- initial release
