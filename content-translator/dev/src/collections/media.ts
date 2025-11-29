import type { CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const mediaSchema: CollectionConfig = {
  slug: 'media',
  fields: [],
  upload: {
    staticDir: path.resolve(dirname, '../media'),
  },
}
