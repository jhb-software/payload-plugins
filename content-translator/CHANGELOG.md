# Changelog

## Unreleased

- feat: add incremental richText translation ("Translate new & changed content") that translates only new or changed paragraphs, preserves existing translations and manual edits, and reports how many paragraphs need review when a source paragraph changed under a hand-edited translation
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
