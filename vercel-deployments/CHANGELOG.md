# Changelog

## Unreleased

- fix: validate the `id` query parameter on the deployments endpoint and encode it before building the Vercel API request path, so only well-formed deployment ids are accepted

## 0.3.1

- fix: stop the deployment widget skeleton from flashing again right after load — the first background poll no longer triggers a redundant refresh of already-rendered data
- fix: deployment widget skeleton now reserves the same height as the loaded row, removing the layout shift when the deployment info appears

## 0.3.0

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16
- fix: respect a user-customized `routes.api` in the deployment poller and trigger button (the fetch previously hardcoded `/api/vercel-deployments`)

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
