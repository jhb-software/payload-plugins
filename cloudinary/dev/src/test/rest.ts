import type { SanitizedConfig } from 'payload'

import { REST_GET, REST_PATCH, REST_POST } from '@payloadcms/next/routes'

/**
 * Sends requests through the same REST route handler the dev app mounts at `/api/[...slug]`, so
 * they run the full Payload request pipeline (auth, multipart parsing, client-upload handling),
 * exactly like a request from the admin panel.
 */

type RESTClientArgs = {
  config: Promise<SanitizedConfig>
  /** A Payload JWT, sent the way the admin panel sends it. */
  token?: string
}

export type ClientUploadFile = {
  clientUploadContext: unknown
  filename: string
  mimeType: string
  size: number
}

export const createRESTClient = ({ config, token }: RESTClientArgs) => {
  const routes = { GET: REST_GET(config), PATCH: REST_PATCH(config), POST: REST_POST(config) }

  const send = async (
    path: string,
    init: { body?: BodyInit; headers?: HeadersInit; method?: keyof typeof routes },
  ) => {
    const method = init.method ?? 'POST'
    const url = new URL(`http://localhost:3000/api/${path.replace(/^\//, '')}`)
    const headers = new Headers(init.headers)
    if (token) {
      headers.set('Authorization', `JWT ${token}`)
    }

    const request = new Request(url, { body: init.body, headers, method })
    const slug = url.pathname.replace(/^\/api\//, '').split('/')

    return await routes[method](request, { params: Promise.resolve({ slug }) })
  }

  return {
    /** GETs a path relative to `/api`, e.g. a file served through the collection's static handler. */
    get: (path: string, headers?: HeadersInit) => send(path, { headers, method: 'GET' }),

    /** PATCHes a JSON body, e.g. to update a document by id. */
    patchJSON: (path: string, body: unknown) =>
      send(path, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      }),

    /** POSTs a JSON body, e.g. to a custom endpoint. `path` is relative to `/api` and may carry a query. */
    postJSON: (path: string, body: unknown) =>
      send(path, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }),

    /** Creates an upload document the way the admin panel does when the file itself is sent to Payload. */
    createWithFile: (
      collection: string,
      { data = {}, file }: { data?: Record<string, unknown>; file: File },
    ) => {
      const form = new FormData()
      form.append('_payload', JSON.stringify(data))
      form.append('file', file)
      return send(collection, { body: form })
    },

    /**
     * Creates an upload document the way the admin panel does after the browser uploaded the file
     * straight to storage: the `file` field carries only a JSON description of that upload.
     */
    createWithClientUpload: (
      collection: string,
      { data = {}, file }: { data?: Record<string, unknown>; file: ClientUploadFile },
    ) => {
      const form = new FormData()
      form.append('_payload', JSON.stringify(data))
      form.append('file', JSON.stringify(file))
      return send(collection, { body: form })
    },
  }
}
