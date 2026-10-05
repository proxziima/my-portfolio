import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { uploadStaticDir } from '../uploads/static-dir'

/** Site icons fetched from a company's or project's URL (see favicons/hooks.ts). Managed by hooks only. */
export const Favicons: CollectionConfig = {
  slug: 'favicons',
  admin: { hidden: true },
  access: publicContentAccess,
  fields: [],
  upload: {
    staticDir: uploadStaticDir('FAVICONS_DIR', 'favicons'),
    // Raster icons only, matching what discoverFavicon accepts. No SVG: it can carry script and is
    // served from the CMS origin.
    mimeTypes: ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'],
    // ICO cannot go through sharp; icons are never cropped or resized.
    focalPoint: false,
    crop: false,
  },
}
