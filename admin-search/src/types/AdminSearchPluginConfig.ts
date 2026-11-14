import type { PayloadRequest, Where } from 'payload'

export type AdminSearchPluginConfig = {
  /**
   * Restricts document results to those matching a constraint resolved against the current
   * request — e.g. the tenant selected in a multi-tenant admin panel, whose id the
   * multi-tenant plugin keeps in the `payload-tenant` cookie:
   *
   * ```ts
   * baseFilter: ({ req }) => ({
   *   tenant: { equals: getTenantFromCookie(req.headers, req.payload.db.defaultIDType) },
   * })
   * ```
   *
   * The search collection must carry the field the filter constrains. This scopes what the
   * search offers; it does not replace access control on the search collection itself.
   */
  baseFilter?: (args: { req: PayloadRequest }) => Promise<Where> | Where

  enabled?: boolean

  headerSearchComponentStyle?: 'bar' | 'button'
}
