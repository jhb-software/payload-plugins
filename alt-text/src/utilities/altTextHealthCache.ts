export type AltTextHealthCacheFactory<T> = (
  compute: () => Promise<T>,
  cacheKeyParts: string[],
  options: {
    revalidate: number
    tags: string[]
  },
) => () => Promise<T>

export function createCachedAltTextHealthScan<T>({
  cacheFactory,
  cacheKeyParts,
  compute,
  revalidate,
  tags,
}: {
  cacheFactory: AltTextHealthCacheFactory<T>
  cacheKeyParts: string[]
  compute: () => Promise<T>
  revalidate: number
  tags: string[]
}): () => Promise<T> {
  return cacheFactory(compute, cacheKeyParts, {
    revalidate,
    tags,
  })
}
