/**
 * Serializes a value with object keys sorted, so two structurally equal values
 * produce the same string regardless of the order their keys were written in.
 *
 * The health scan uses it to derive a cache key from the resolved base filter:
 * narrowing the scan then always narrows its cache entry, which no amount of
 * documentation can guarantee for a caller-supplied key.
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
