# Changelog

## Unreleased

- feat: display icon and title in same row with larger title using Payload CSS vars
- feat: add optional `widget.websiteUrl` config to display a website link
- feat: make widget description optional and configurable via `widget.description`
- refactor: use i18next interpolation for translations

## 0.1.0

- feat: add Vercel deployment dashboard widget with deployment status, one-click redeploy, and real-time polling
- feat: add authenticated REST API endpoints (`GET /api/vercel-deployments`, `POST /api/vercel-deployments`)
- feat: add configurable `access` function for endpoint authorization
- feat: add multi-language support (English and German)
