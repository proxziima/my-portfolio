import type { CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'
import { publicContentAccess } from '../access/public-read'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const Media: CollectionConfig = {
  slug: 'media',
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [{ name: 'alt', type: 'text', required: true }],
  upload: { staticDir: path.resolve(dirname, '../../public/media'), mimeTypes: ['image/*'] },
}
