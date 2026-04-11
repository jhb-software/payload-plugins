import { stringify } from 'qs-esm'

export type FetchRestApiConfig = {
  /** Payload API route prefix (e.g. "/api" or a user-customized value). */
  apiRoute: string
  /** Optional Payload serverURL prefix. */
  serverURL?: string
}

/** Fetches a document via the Payload REST API. This should only be used if the local API is not available. */
export async function fetchRestApi<T>(
  path: string,
  options: Record<string, any>,
  config: FetchRestApiConfig,
): Promise<T> {
  const url = `${config.serverURL ?? ''}${config.apiRoute}${path}?${stringify(options)}`
  const response = await fetch(url, {
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
