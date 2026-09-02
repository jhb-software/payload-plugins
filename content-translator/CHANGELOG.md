# Changelog

## Unreleased

- feat: add `anthropicResolver`, a translation resolver for Claude (default `claude-opus-5`). It constrains the response with a JSON schema requiring exactly one translation per input index, so a merged or dropped entry is rejected by the provider rather than reconstructed after the fact, and a refusal or a truncated answer is reported as such instead of surfacing as a JSON parse error. The model must accept `output_config.effort`, which rules out `claude-haiku-4-5`.
- feat: add `mistralResolver`, a translation resolver for Mistral's chat models (default `mistral-medium-latest`), taking the same `chunkLength` and `instructions` options as the OpenAI resolver
- feat: export `createOpenAICompatibleResolver`, which builds a resolver for any provider serving OpenAI's `/v1/chat/completions` endpoint with JSON mode. `openAIResolver` and `mistralResolver` are thin wrappers around it.
- change: resolver error messages and log entries name the provider they came from, so a `baseUrl` pointing elsewhere no longer reports failures as OpenAI's. The log key `openAIresponse` is now `response`.

## 0.5.0

- feat: export `createPromptResolver`, which builds a resolver for any LLM provider from a single `generate` function
- feat: the OpenAI resolver's new `instructions` option appends project-specific rules (e.g. protected brand names) to the built-in ones, and may be async. The texts are sent as the user message, so customized instructions cannot alter them.
- **BREAKING**: the OpenAI resolver's `prompt` option is replaced by `instructions`, which returns the instructions without the texts: `instructions: ({ defaultInstructions, localeFrom, localeTo }) => ...`. `OpenAIPrompt` is replaced by `TranslateInstructions`.
- fix: restrict the translate endpoint to the collections and globals configured in the plugin options; requests targeting any other entity are now rejected with a 400 before any document is read or written or sent to the resolver

## 0.4.0

- feat: add a per-field `custom['content-translator']` config (typed via module augmentation) with orthogonal `skip`, `beforeTranslate`, and `afterTranslate` hooks, so a slug can either be derived from the translated title (skip + derive) or translated and then slugified (translate + normalize)
- feat: the translate endpoint can now persist results via an `update` flag (and optional `draft` flag), enabling programmatic/agent translation over the REST API instead of only returning the translated data
- feat: the `access` function now receives the parsed request body (e.g. `update`, `collectionSlug`), so persisting can be authorized separately from returning translations
- fix: enforce the requesting user's read access on the source document during translation; previously the source read bypassed access control, so a user could translate and receive content from a document they could not read
- **BREAKING**: the `custom.translatorSkip` flag is removed — move it to `custom: { 'content-translator': { skip: true } }`
- **BREAKING**: serve the translate endpoint at `/api/content-translator/translate` (previously `/api/translator/translate`) so the endpoint prefix matches the plugin slug. Any API client calling the old path must be updated.

## 0.3.0

- fix: translate rich text block-level elements as one unit using segment markers so inline formatting spans stay aligned and word order can change across languages
- fix: reconstruct OpenAI translations by input index so a merged, dropped, or reordered entry no longer shifts later translations into the wrong fields; missing entries keep their original text
- fix: abort a translation when the resolver returns a different number of texts than were sent, and guard against non-string values reaching `he.decode`
- fix: translate each entry of `hasMany` text fields individually so keyword/tag lists are translated instead of crashing
- fix: translate fields inside unnamed (presentational) groups instead of throwing an "Unnamed groups are currently not supported" error
- fix: skip fields and tabs named `__proto__`, `constructor`, or `prototype` during traversal to avoid prototype-polluting writes when a user-supplied Payload config contains such a name

## 0.2.0

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16
- style: standardize icons to use Geist icon set (16x16 filled)
- feat: add configurable `access` option for the translate endpoint (defaults to requiring authentication)
- fix: "translate empty fields" now populates localized fields nested inside groups and named tabs when the target locale has no value yet

## 0.1.2

- fix: lowercase locale codes before passing them to the translation prompt for ISO 639 compliance

## 0.1.1

- fix: use ISO 639 language codes instead of uppercased locale codes in translation prompt to avoid ambiguity (e.g. `uk` for Ukrainian being confused with United Kingdom)

## 0.1.0

Initial release.
