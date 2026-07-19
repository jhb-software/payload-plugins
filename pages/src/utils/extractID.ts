/** Extracts a plain ID from a value that may be a raw ID or a populated document object. */
export function extractID(value: unknown): null | number | string | undefined {
  if (value === null || value === undefined) {
    return value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }
  if (typeof value === 'object' && 'id' in value) {
    return (value as { id: number | string }).id
  }
  return undefined
}
