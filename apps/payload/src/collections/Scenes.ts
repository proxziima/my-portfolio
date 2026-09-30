import type { CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'
import { publicContentAccess } from '../access/public-read'
import { requireSplineFile } from '../hooks/require-spline-file'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Spline exports for the desk figure, picked in Site settings → Figure → Scene.
 * No `mimeTypes`: Spline files have no MIME type Payload can sniff, so with a list set its extension
 * fallback reads them as `text/plain` and rejects them. `requireSplineFile` checks the extension instead.
 * No `imageSizes`, and Payload only hands images to sharp, so these binaries are stored untouched.
 */
export const Scenes: CollectionConfig = {
  slug: 'scenes',
  labels: { singular: 'Spline scene', plural: 'Spline scenes' },
  admin: { group: 'Site', useAsTitle: 'title', defaultColumns: ['title', 'filename', 'updatedAt'] },
  access: publicContentAccess,
  hooks: { ...revalidateCollectionHooks, beforeValidate: [requireSplineFile] },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'notes', type: 'textarea' },
  ],
  upload: {
    staticDir: path.resolve(dirname, '../../public/scenes'),
    // Image-only tools: hide them for binaries.
    crop: false,
    focalPoint: false,
    // The file route would otherwise guess `text/plain` from the unknown extension.
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Content-Type', 'application/octet-stream')
      return headers
    },
  },
}
