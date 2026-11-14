/**
 * Behavioral fake of one instance's Next.js data cache: `unstable_cache`
 * memoizes per key until one of the entry's tags is revalidated on this
 * instance. A write handled by another instance never reaches it.
 */
const entries = new Map<string, { tags: string[]; value: Promise<unknown> }>()

export const nextDataCacheFake = {
  revalidateTag: (tag: string): void => {
    for (const [key, entry] of entries) {
      if (entry.tags.includes(tag)) {
        entries.delete(key)
      }
    }
  },
  unstable_cache:
    (compute: () => Promise<unknown>, keyParts: string[], { tags }: { tags: string[] }) =>
    () => {
      const key = keyParts.join('|')
      const cached = entries.get(key)
      if (cached) {
        return cached.value
      }
      const value = compute()
      entries.set(key, { tags, value })
      return value
    },
}
