# Changelog

## Unreleased

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16

## 0.2.1

- style: standardize icons to use Geist icon set (16x16 filled)
- style: use cloud icon for deployment widget title instead of info icon
- refactor: improve widget translations (remove "Vercel" from title, simplify German translations)

## 0.2.0

- fix: prevent widget from refreshing when deployment data has not changed (fixes constant refresh in dashboard edit mode)
- feat: display icon and title in same row with larger title using Payload CSS vars
- feat: add optional `widget.websiteUrl` config to display a website link
- feat: make widget description optional and configurable via `widget.description`
- refactor: use i18next interpolation for translations

## 0.1.0

- feat: add Vercel deployment dashboard widget with deployment status, one-click redeploy, and real-time polling
- feat: add authenticated REST API endpoints (`GET /api/vercel-deployments`, `POST /api/vercel-deployments`)
- feat: add configurable `access` function for endpoint authorization
- feat: add multi-language support (English and German)
