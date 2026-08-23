import type { PayloadRequest, Where } from 'payload'

import type { Locale } from './Locale.js'

/** How a localized install maps locales onto path prefixes. */
export type LocaleRouting = {
  /**
   * Whether the primary locale's paths carry the `/<locale>` prefix.
   *
   * `false` serves the primary locale at `/kontakt` and every other locale at
   * `/<locale>/kontakt`.
   *
   * @default true
   */
  prefixPrimaryLocale?: boolean

  /**
   * The site's primary locale. Must be one of `localization.localeCodes`.
   *
   * Emitted as `x-default` in `alternatePaths`, and used as the locale of an unprefixed path in
   * `findPageByPath` when no `locale` argument is given. Independent of Payload's
   * `localization.defaultLocale`, which stays a storage and fallback concern.
   */
  primaryLocale: Locale
}

/** Configuration options for the pages plugin. */
export type PagesPluginConfig = {
  /**
   * The base filter to apply to find queries which are executed by the pages plugin internally.
   *
   * This is useful for multi-tenant setups where you want to restrict the pages plugin to only
   * operate on pages which belong to the current tenant.
   */
  baseFilter?: (args: { req: PayloadRequest }) => Where

  /** Whether the pages plugin is enabled. */
  enabled?: boolean

  /**
   * Function to generate the full URL to a frontend page. This will be passed to Payload's preview and live preview features.
   *
   * @param args - The arguments for URL generation
   * @param args.path - The path to the page (always starts with '/')
   * @param args.preview - Whether this is a preview URL
   * @returns The full URL to the frontend page or null/undefined to not render the preview button.
   *
   * @example
   * ```ts
   * generatePageURL: ({ path, preview }) =>
   *   path ? `${process.env.NEXT_PUBLIC_FRONTEND_URL}${preview ? '/preview' : ''}${path}` : null
   * ```
   */
  generatePageURL: (args: {
    data: Record<string, unknown>
    path: null | string
    preview: boolean
    req: PayloadRequest
  }) => (null | string) | Promise<null | string>

  /**
   * Locale routing for localized installs.
   *
   * A static value applies to the whole install; a function is evaluated once per request (the
   * result is cached on `req.context`) so it can derive the routing from the request — e.g. from
   * the tenant — without a per-document cost. Return `undefined` for the default: every locale
   * prefixed, no `x-default`.
   *
   * Ignored when Payload localization is disabled.
   *
   * @example
   * ```ts
   * localeRouting: { primaryLocale: 'de', prefixPrimaryLocale: false }
   * ```
   */
  localeRouting?:
    | ((args: {
        req: PayloadRequest
      }) => LocaleRouting | Promise<LocaleRouting | undefined> | undefined)
    | LocaleRouting

  /**
   * Whether to prevent deletion of parent documents that have child documents referencing them.
   *
   * When enabled (default), the plugin will check for child documents before allowing deletion
   * of a parent document. This protection is only applied for MongoDB, SQLite, and PostgreSQL
   * database adapters that don't enforce foreign key constraints natively.
   *
   * Set to false to disable this protection and allow deletion of parent documents regardless
   * of existing child references. To keep the protection but skip it for a single operation, pass
   * `SKIP_PARENT_GUARD_CONTEXT_KEY` through that operation's `context` instead.
   *
   * @default true
   */
  preventParentDeletion?: boolean

  /**
   * The filter to apply to find queries when validating redirects.
   *
   * This is useful for multi-tenant setups where you want to restrict the redirects plugin to
   * account for redirects in the same tenant while validating redirects on create/update.
   */
  redirectValidationFilter?: (args: { doc: any; req: PayloadRequest }) => Where
}
