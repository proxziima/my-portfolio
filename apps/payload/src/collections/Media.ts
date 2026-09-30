import type { CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'
import { authenticated } from '../access/authenticated'
import { publicRead } from '../access/public-read'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: publicRead, create: authenticated, update: authenticated, delete: authenticated },
  fields: [{ name: 'alt', type: 'text', required: true }],
  upload: { staticDir: path.resolve(dirname, '../../public/media'), mimeTypes: ['image/*'] },
}
