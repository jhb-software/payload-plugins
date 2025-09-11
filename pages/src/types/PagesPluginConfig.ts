import { PayloadRequest, Where } from 'payload'

/** Configuration options for the pages plugin. */
export type PagesPluginConfig = {
  /** Whether the pages plugin is enabled. */
  enabled?: boolean

  /**
   * The base filter to apply to find queries which are executed by the pages plugin internally.
   *
   * This is useful for multi-tenant setups where you want to restrict the pages plugin to only
   * operate on pages which belong to the current tenant.
   */
  baseFilter?: (args: { req: PayloadRequest }) => Where

  /**
   * The filter to apply to find queries when validating redirects.
   *
   * This is useful for multi-tenant setups where you want to restrict the redirects plugin to
   * account for redirects in the same tenant while validating redirects on create/update.
   */
  redirectValidationFilter?: (args: { req: PayloadRequest; doc: any }) => Where

  /**
   * Whether to prevent deletion of parent documents that have child documents referencing them.
   * 
   * When enabled (default), the plugin will check for child documents before allowing deletion
   * of a parent document. This protection is only applied for MongoDB, SQLite, and PostgreSQL
   * database adapters that don't enforce foreign key constraints natively.
   * 
   * Set to false to disable this protection and allow deletion of parent documents regardless
   * of existing child references.
   * 
   * @default true
   */
  preventParentDeletion?: boolean
}
