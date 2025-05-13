/** Returns the full URL to the frontend page of the CMS collection document with the given path. */
export function getPageUrl({
  path,
  preview = false,
}: {
  path: string
  preview?: boolean
}): string | undefined {
  const domain = process.env.NEXT_PUBLIC_FRONTEND_URL!

  if (!path) {
    console.error('getPageUrl received an empty path: ' + path)
    return undefined
  }

  if (!path.startsWith('/')) {
    throw new Error('Path must start with a slash: ' + path)
  }

  const url = `${domain}${preview ? '/preview' : ''}${path}`

  return url
}
