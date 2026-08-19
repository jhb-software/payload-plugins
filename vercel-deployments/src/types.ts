import type { PayloadRequest } from 'payload'

/**
 * A value that is either static, or resolved per request — e.g. from the tenant
 * selected in a multi-tenant admin panel.
 */
export type Resolvable<T> = ((args: { req: PayloadRequest }) => Promise<T> | T) | T

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
     * Vercel Project ID to monitor. Pass a function to resolve it per request, e.g. from
     * the tenant selected in a multi-tenant admin panel. Resolving to `undefined` means
     * the request has no deployment target: the widget hides its deploy action and the
     * endpoints answer 400.
     */
    projectId: Resolvable<string | undefined>

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
     * Optional description/note displayed at the bottom of the widget.
     * Pass a string for a single language, or a Record<language, string> for multiple languages
     * (e.g. `{ en: 'English text', de: 'German text' }`).
     */
    description?: Record<string, string> | string

    /**
     * Maximum widget width. Default: 'full'
     */
    maxWidth?: 'full' | 'large' | 'medium' | 'small' | 'x-large' | 'x-small'

    /**
     * Minimum widget width. Default: 'medium'
     */
    minWidth?: 'full' | 'large' | 'medium' | 'small' | 'x-large' | 'x-small'

    /**
     * URL of the frontend website. Displayed as a link in the widget.
     * Pass a function to resolve it per request.
     */
    websiteUrl?: Resolvable<string | undefined>
  }
}
