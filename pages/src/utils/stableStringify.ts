/**
 * Serializes a value with object keys sorted, so two structurally equal values produce the
 * same string regardless of the order their keys were written in.
 *
 * The path cache uses it to derive the scope segment of a cache key: two `baseFilter`s that
 * constrain the same thing then share a cache slot instead of each building their own,
 * which `JSON.stringify` alone cannot guarantee because it preserves insertion order.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)

    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value) ?? 'null'
}
