import type { Metadata } from 'next'
import { Desktop } from '@/features/os/Desktop'
import { getPortfolio } from '@/lib/cms/queries'

// Same data path as the letter: per request, CMS fetches cached under the `cms` tag.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Desktop', robots: { index: false, follow: false } }

export default async function OsPage() {
  return <Desktop data={await getPortfolio()} />
}
