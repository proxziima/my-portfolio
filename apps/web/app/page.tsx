import type { Metadata } from 'next'
import { Portfolio } from '@/features/portfolio/Portfolio'
import { getPortfolio } from '@/lib/cms/queries'

// Rendered per request, so builds never need the CMS. The CMS fetches still hit the data cache:
// they set an explicit `next.revalidate` (and the `cms` tag), which force-dynamic leaves alone.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getPortfolio()
  return {
    title: settings.seo.title,
    description: settings.seo.description,
    openGraph: settings.seo.ogImage ? { images: [settings.seo.ogImage] } : undefined,
  }
}

export default async function Page() {
  return <Portfolio data={await getPortfolio()} />
}
