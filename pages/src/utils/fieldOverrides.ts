import type { Condition, FilterOptions, FilterOptionsProps, Where } from 'payload'

import { deepMergeSimple } from './deepMergeSimple.js'

/**
 * Deep merges a user supplied `admin` config over the plugin's, so an override
 * can replace a single nested key (e.g. `components.Field`) without dropping
 * the rest.
 *
 * `condition` is ANDed instead of replaced: the plugin's conditions encode
 * invariants (the root page has no parent), so an override can only hide the
 * field in more cases, never reveal it in fewer.
 */
export function mergeFieldAdmin<TAdmin extends object>(
  base: TAdmin,
  override: TAdmin | undefined,
): TAdmin {
  if (!override) {
    return base
  }

  const merged = deepMergeSimple<TAdmin>(base, override)

  const baseCondition = (base as WithCondition).condition
  const overrideCondition = (override as WithCondition).condition

  if (baseCondition && overrideCondition) {
    ;(merged as WithCondition).condition = (...args) =>
      baseCondition(...args) && overrideCondition(...args)
  }

  return merged
}

type WithCondition = { condition?: Condition }

const resolveFilterOptions = async (
  filterOptions: Exclude<FilterOptions, null>,
  options: FilterOptionsProps,
): Promise<boolean | Where> =>
  typeof filterOptions === 'function' ? await filterOptions(options) : filterOptions

/**
 * ANDs a user supplied `filterOptions` with the plugin's, so the plugin's own
 * constraints (a document can never be its own parent) stay in place and a
 * consumer only expresses the constraint it cares about.
 */
export function composeFilterOptions(
  base: FilterOptions,
  override: FilterOptions | undefined,
): FilterOptions {
  if (!override) {
    return base
  }

  if (!base) {
    return override
  }

  return async (options) => {
    const [baseResult, overrideResult] = await Promise.all([
      resolveFilterOptions(base, options),
      resolveFilterOptions(override, options),
    ])

    // `false` means "no options at all" and wins outright.
    if (baseResult === false || overrideResult === false) {
      return false
    }

    // `true` means "no constraint", so the other side is the whole filter.
    if (baseResult === true) {
      return overrideResult
    }

    if (overrideResult === true) {
      return baseResult
    }

    return { and: [baseResult, overrideResult] }
  }
}
