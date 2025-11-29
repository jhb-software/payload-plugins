export const isEmpty = (value: unknown) => {
  if (Array.isArray(value)) return value.length === 0
  if (value === null || typeof value === 'undefined') return true
  if (typeof value === 'object' && 'root' in value) return isEmptyLexical(value)
  if (typeof value === 'object' && Object.keys(value).length === 0) return true

  return false
}

export const isEmptyLexical = (value: Record<string, unknown>) => {
  if (
    'root' in value &&
    typeof value.root === 'object' &&
    value.root &&
    'children' in value.root &&
    Array.isArray(value.root.children)
  ) {
    if (value.root.children.length === 0) {
      return true
    } else if (
      value.root.children.length === 1 &&
      'children' in value.root.children[0] &&
      Array.isArray(value.root.children[0].children)
    ) {
      return value.root.children[0].children.length === 0
    }
  }

  return false
}
