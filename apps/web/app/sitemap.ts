import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

// SITE_URL is runtime config: render per request so it is never frozen at build.
export const dynamic = 'force-dynamic'

/** One public page today; the blog adds its posts here when it launches. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/`, changeFrequency: 'monthly', priority: 1 }]
}
