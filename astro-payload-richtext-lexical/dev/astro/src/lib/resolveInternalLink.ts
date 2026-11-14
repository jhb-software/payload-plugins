/**
 * Turns an internal-link target document into an href. Handles a `path` field
 * (e.g. from the pages plugin) and falls back to `slug`, with a `/blog/` prefix
 * for posts. Matches the plugin's `ResolveInternalLink` signature structurally.
 */
export const resolveInternalLink = (
  doc: Record<string, unknown>,
  relationTo: string,
): string | undefined => {
  if (typeof doc.path === 'string') {
    return doc.path
  }

  if (typeof doc.slug === 'string') {
    return relationTo === 'posts' ? `/blog/${doc.slug}` : `/${doc.slug}`
  }

  return undefined
}
