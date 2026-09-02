import type { PayloadRequest } from 'payload'

/**
 * The Vercel project a request reports on and deploys to, and the website it is served
 * from. A `projectId` of `undefined` means the request has no deployment target.
 */
export type DeploymentTarget = {
  /**
   * Shown in the widget when `projectId` is `undefined`, explaining why there is nothing
   * to report — e.g. "No website selected" vs. "This website has not been deployed yet".
   * Only the resolver knows the reason, so it decides the wording; `req.i18n.language`
   * is available for localizing it. Defaults to a built-in translated hint.
   */
  message?: string

  /**
   * Vercel Project ID to monitor.
   */
  projectId: string | undefined

  /**
   * URL of the frontend website. Displayed as a link in the widget.
   */
  websiteUrl?: string | undefined
}

/**
 * Resolves the deployment target of a request — e.g. from the tenant selected in a
 * multi-tenant admin panel. Called once per request, so a single lookup serves both
 * the project and the website URL.
 */
export type ResolveDeploymentTarget = (args: {
  req: PayloadRequest
}) => DeploymentTarget | Promise<DeploymentTarget>

export type VercelDeploymentsPluginConfig = {
  /**
   * Custom access control function for the plugin's API endpoints.
   * Receives the Payload request and should return true to allow access.
   * Defaults to checking `req.user` (i.e. any authenticated admin user).
   */
  access?: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /**
   * The Vercel project to report on and deploy to, and the website it is served from.
   *
   * Pass a function to resolve it per request, e.g. from the tenant selected in a
   * multi-tenant admin panel. A `projectId` of `undefined` means the request has no
   * deployment target: the widget shows `message` (or a built-in hint) instead of the
   * deployment status, hides its deploy action, and the endpoints answer 400.
   */
  deploymentTarget: DeploymentTarget | ResolveDeploymentTarget

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
  }
}
