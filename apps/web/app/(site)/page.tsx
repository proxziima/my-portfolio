import type { Metadata } from 'next'
import { Portfolio } from '@/features/portfolio/Portfolio'
import { getPortfolio } from '@/lib/cms/queries'
import { personJsonLd } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/site'

// Rendered per request, so builds never need the CMS. The CMS fetches still hit the data cache:
// they set an explicit `next.revalidate` (and the `cms` tag), which force-dynamic leaves alone.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { settings, profile } = await getPortfolio()
  const images = settings.seo.ogImage ? [settings.seo.ogImage] : undefined
  return {
    title: settings.seo.title,
    description: settings.seo.description,
    alternates: { canonical: '/' },
    // Next merges metadata shallowly: this object replaces the layout's openGraph, so it repeats type and locale.
    openGraph: { type: 'website', locale: 'en_US', title: settings.seo.title, description: settings.seo.description, siteName: profile.name, url: '/', images },
    twitter: { title: settings.seo.title, description: settings.seo.description, images },
  }
}

export default async function Page() {
  const data = await getPortfolio()
  // `<` escaped so CMS text can never close the script element.
  const jsonLd = JSON.stringify(personJsonLd(data, siteUrl())).replace(/</g, '\\u003c')
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Portfolio data={data} />
    </>
  )
}
