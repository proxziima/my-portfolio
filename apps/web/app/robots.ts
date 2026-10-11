import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

// SITE_URL is runtime config: render per request so it is never frozen at build.
export const dynamic = 'force-dynamic'

/** Crawl the letter; skip the API, the analytics relay, editor previews and the noindex desktop. */
export default function robots(): MetadataRoute.Robots {
  const site = siteUrl()
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/relay/', '/blog/preview/', '/os'] },
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}
