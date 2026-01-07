# Vercel Dashboard Widget for Payload CMS

A [Payload CMS](https://payloadcms.com/) plugin that adds a Vercel deployment info widget to the admin dashboard. The widget displays the current deployment status, allows triggering new deployments, and provides real-time status updates.

## Features

- Dashboard widget showing current production deployment status
- One-click production deployment trigger
- Real-time deployment status polling
- Multi-language support (English and German included)
- Configurable widget size

## Requirements

- Payload CMS 3.69.0 or higher
- Next.js 15.0.0 or higher
- A Vercel project with API access

## Installation

```bash
pnpm add @jhb.software/payload-vercel-dashboard-widget
```

## Setup

Add the plugin to your Payload config:

```ts
import { vercelDashboardPlugin } from '@jhb.software/payload-vercel-dashboard-widget'

export default buildConfig({
  plugins: [
    vercelDashboardPlugin({
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

## Getting Vercel API Token

1. Go to your [Vercel Account Settings](https://vercel.com/account/tokens)
2. Click "Create Token"
3. Give it a descriptive name (e.g., "Payload CMS Dashboard")
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
