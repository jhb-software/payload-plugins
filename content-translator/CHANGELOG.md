# Changelog

## Unreleased

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16
- style: standardize icons to use Geist icon set (16x16 filled)
- feat: add configurable `access` option for the translate endpoint (defaults to requiring authentication)

## 0.1.2

- fix: lowercase locale codes before passing them to the translation prompt for ISO 639 compliance

## 0.1.1

- fix: use ISO 639 language codes instead of uppercased locale codes in translation prompt to avoid ambiguity (e.g. `uk` for Ukrainian being confused with United Kingdom)

## 0.1.0

Initial release.
