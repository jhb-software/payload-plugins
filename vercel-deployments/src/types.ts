import type { PayloadRequest } from 'payload'

export type VercelDeploymentsPluginConfig = {
  /**
   * Custom access control function for the plugin's API endpoints.
   * Receives the Payload request and should return true to allow access.
   * Defaults to checking `req.user` (i.e. any authenticated admin user).
   */
  access?: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /**
   * Whether the plugin is enabled. Defaults to true.
   */
  enabled?: boolean

  /**
   * Vercel API configuration
   */
  vercel: {
    /**
     * Vercel API Bearer Token
     */
    apiToken: string

    /**
     * Vercel Project ID to monitor
     */
    projectId: string

    /**
     * Vercel Team ID (required for team projects)
     */
    teamId?: string
  }

  /**
   * Widget configuration
   */
  widget?: {
    /**
     * Maximum widget width. Default: 'full'
     */
    maxWidth?: 'full' | 'large' | 'medium' | 'small' | 'x-large' | 'x-small'

    /**
     * Minimum widget width. Default: 'medium'
     */
    minWidth?: 'full' | 'large' | 'medium' | 'small' | 'x-large' | 'x-small'
  }
}
