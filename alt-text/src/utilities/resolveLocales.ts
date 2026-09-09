import type { PayloadRequest } from 'payload'

import type { AltTextPluginConfig } from '../types/AltTextPluginConfig.js'

/**
 * The locales one request generates for and is measured against — the configured
 * list itself when no `filterLocales` is set.
 *
 * Throws on an empty or out-of-range result, which would otherwise write into a
 * locale the project does not define.
 */
export async function resolveLocales({
  pluginConfig,
  req,
}: {
  pluginConfig: AltTextPluginConfig
  req: PayloadRequest
}): Promise<string[]> {
  const configured = configuredLocales(pluginConfig)

  if (!pluginConfig.filterLocales) {
    return configured
  }

  // Deduplicated: a repeated locale would be generated and written twice, and
  // reach the resolver as a duplicate key in the schema it must answer with.
  const filtered = [...new Set(await pluginConfig.filterLocales({ locales: configured, req }))]

  const unconfigured = filtered.filter((locale) => !configured.includes(locale))

  if (unconfigured.length > 0) {
    throw new Error(
      `filterLocales returned ${unconfigured.join(', ')}, which the Payload config does not define. ` +
        `Configured locales: ${configured.join(', ')}.`,
    )
  }

  if (filtered.length === 0) {
    throw new Error(
      'filterLocales returned no locales, leaving nothing to generate or report on. ' +
        'Return at least one of the configured locales.',
    )
  }

  return filtered
}

/** The configured locales, or the single fallback locale when localization is off. */
export function configuredLocales(pluginConfig: AltTextPluginConfig): string[] {
  if (pluginConfig.locales.length > 0) {
    return pluginConfig.locales
  }

  return pluginConfig.locale ? [pluginConfig.locale] : []
}
