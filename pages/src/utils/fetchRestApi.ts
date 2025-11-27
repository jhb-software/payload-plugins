import { stringify } from 'qs-esm'

/** Fetches a document via the Payload REST API. This should only be used if the local API is not available. */
export async function fetchRestApi<T>(path: string, options: Record<string, any>): Promise<T> {
  const response = await fetch('/api' + path + '?' + stringify(options), {
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch the requested document via the Payload REST API. ${response.statusText}`,
    )
  }

  return await response.json()
}
