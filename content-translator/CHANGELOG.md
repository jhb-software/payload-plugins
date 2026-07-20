# Changelog

## Unreleased

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
