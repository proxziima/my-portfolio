import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'
import { uploadStaticDir } from '../uploads/static-dir'

export const Media: CollectionConfig = {
  slug: 'media',
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [{ name: 'alt', type: 'text', required: true }],
  upload: { staticDir: uploadStaticDir('MEDIA_DIR', 'media'), mimeTypes: ['image/*'] },
}
