import type { SanitizedConfig } from 'payload'

/** Returns the locales from the config. Returns undefined when localization is disabled. */
export function localesFromConfig(config: SanitizedConfig): string[] | undefined {
  if (typeof config.localization === 'object' && config.localization) {
    return config.localization.localeCodes
  } else {
    return undefined
  }
}
