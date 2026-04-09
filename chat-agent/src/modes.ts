/**
 * Agent mode resolution and access control.
 *
 * Determines which modes are available to a user and validates
 * that a requested mode is allowed.
 */

import {
  AGENT_MODES,
  type AgentMode,
  type ChatAgentPluginOptions,
  type ModesConfig,
} from './types.js'

// ---------------------------------------------------------------------------
// Resolve modes config (with backward compatibility)
// ---------------------------------------------------------------------------

/**
 * Build a `ModesConfig` from plugin options, handling backward compatibility
 * with the deprecated `superuserAccess` option.
 */
export function resolveModeConfig(options: ChatAgentPluginOptions | undefined): ModesConfig {
  if (options?.modes) {
    return options.modes
  }

  // Backward compatibility: map superuserAccess to modes.access.superuser
  if (options?.superuserAccess) {
    const sa = options.superuserAccess
    return {
      access: {
        superuser: typeof sa === 'function' ? ({ req }) => sa(req) : () => sa === true,
      },
    }
  }

  return {}
}

// ---------------------------------------------------------------------------
// Resolve available modes for a user
// ---------------------------------------------------------------------------

/**
 * Evaluate all mode access functions against the current request and return
 * the list of modes available to the user.
 *
 * Rules:
 * - `read` is always available (cannot be restricted).
 * - `superuser` is only available if an explicit access function is configured
 *   and returns true.
 * - Other modes are available to all authenticated users unless an access
 *   function is configured that returns false.
 */
export async function resolveAvailableModes(
  modesConfig: ModesConfig,
  req: any,
): Promise<AgentMode[]> {
  const available: AgentMode[] = []

  for (const mode of AGENT_MODES) {
    // read is always available
    if (mode === 'read') {
      available.push(mode)
      continue
    }

    // superuser requires explicit access configuration
    if (mode === 'superuser' && !modesConfig.access?.superuser) {
      continue
    }

    const accessFn = modesConfig.access?.[mode]
    if (!accessFn) {
      // No access function = available to all authenticated users
      available.push(mode)
    } else if (await accessFn({ req })) {
      available.push(mode)
    }
  }

  return available
}

// ---------------------------------------------------------------------------
// Validate a requested mode
// ---------------------------------------------------------------------------

/**
 * Check that a requested mode is valid and the user has access to it.
 * Returns an error string if invalid, or null if allowed.
 */
export async function validateModeAccess(
  mode: unknown,
  modesConfig: ModesConfig,
  req: any,
): Promise<null | string> {
  if (typeof mode !== 'string' || !(AGENT_MODES as readonly string[]).includes(mode)) {
    return `Invalid mode "${mode}". Must be one of: ${AGENT_MODES.join(', ')}`
  }

  const available = await resolveAvailableModes(modesConfig, req)
  if (!available.includes(mode as AgentMode)) {
    return `Access denied for mode "${mode}"`
  }

  return null
}

/**
 * Get the default mode from configuration.
 */
export function getDefaultMode(modesConfig: ModesConfig): AgentMode {
  return modesConfig.default ?? 'ask'
}
