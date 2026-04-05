# Vercel Deployments for Payload CMS

A [Payload CMS](https://payloadcms.com/) plugin for managing Vercel deployments of static websites. When your website is statically built on Vercel for performance, content changes in the CMS require a rebuild and redeploy. This plugin provides both a dashboard widget and authenticated API endpoints to monitor and trigger those deployments.

## Features

- **Dashboard widget** showing active and latest production deployment status
- **One-click redeploy** of the latest READY production deployment
- **Real-time status polling** with live updates during builds
- **Authenticated REST API endpoints** for triggering and monitoring deployments programmatically (e.g. from CI/CD pipelines, agents, or scripts)
- **Multi-language support** (English and German included)
- **Configurable widget size**

## Requirements

- Payload CMS 3.80.0 or higher
- Next.js 15.4.x
- A Vercel project with API access

## Installation

```bash
pnpm add @jhb.software/payload-vercel-deployments
```

## Setup

Add the plugin to your Payload config:

```ts
import { vercelDeploymentsPlugin } from '@jhb.software/payload-vercel-deployments'

export default buildConfig({
  plugins: [
    vercelDeploymentsPlugin({
      vercel: {
        apiToken: process.env.VERCEL_API_TOKEN!,
        projectId: process.env.VERCEL_PROJECT_ID!,
        teamId: process.env.VERCEL_TEAM_ID, // Optional, required for team projects
      },
      widget: {
        minWidth: 'medium', // Optional, default: 'medium'
        maxWidth: 'full',   // Optional, default: 'full'
      },
    }),
  ],
})
```

## Configuration

### Plugin Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `vercel.apiToken` | `string` | Yes | Vercel API Bearer Token |
| `vercel.projectId` | `string` | Yes | Vercel Project ID to monitor |
| `vercel.teamId` | `string` | No | Vercel Team ID (required for team projects) |
| `widget.minWidth` | `WidgetWidth` | No | Minimum widget width (default: 'medium') |
| `widget.maxWidth` | `WidgetWidth` | No | Maximum widget width (default: 'full') |
| `enabled` | `boolean` | No | Enable/disable the plugin (default: true) |

### WidgetWidth Values

`'x-small'` | `'small'` | `'medium'` | `'large'` | `'x-large'` | `'full'`

## API Endpoints

All endpoints require authentication (Payload admin user session or API key).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/vercel-deployments` | Returns the active (latest READY) and latest production deployment |
| `GET` | `/api/vercel-deployments?id=<id>` | Returns the status of a specific deployment |
| `POST` | `/api/vercel-deployments` | Triggers a new production deployment by redeploying the latest READY build |

### Example: Trigger a deployment via API

```bash
curl -X POST https://your-cms.com/api/vercel-deployments \
  -H "Authorization: Bearer YOUR_PAYLOAD_API_KEY"
```

### Why redeploy instead of a new deployment?

The plugin redeploys the latest READY production deployment rather than creating a new deployment from scratch. This ensures that Vercel's [Ignored Build Step](https://vercel.com/docs/projects/overview#ignored-build-step) is bypassed — if your project uses an ignore build script that checks for code changes (e.g. `git diff`), a regular deployment would be skipped since only CMS content changed, not code. Redeploying an existing deployment avoids this check entirely.

## Getting Vercel API Token

1. Go to your [Vercel Account Settings](https://vercel.com/account/tokens)
2. Click "Create Token"
3. Give it a descriptive name (e.g., "Payload CMS Deployments")
4. Set appropriate scope (Full Account or specific project)
5. Copy the token to your environment variables

## Getting Vercel Project ID and Team ID

1. Go to your Vercel project dashboard
2. Navigate to Settings > General
3. Find "Project ID" in the project settings
4. If using a team, find "Team ID" in your team settings

## Roadmap

> **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
