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
    // Only what discoverFavicon returns (see favicons/normalize.ts): an ICO kept as fetched, or a PNG
    // freshly encoded from the icon's pixels. Never markup such as SVG, which could run script when
    // opened directly on the CMS origin.
    mimeTypes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
    // ICO cannot go through sharp; icons are never cropped or resized.
    focalPoint: false,
    crop: false,
  },
}
