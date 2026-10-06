import type { Metadata } from 'next'
import { Desktop } from '@/features/os/Desktop'
import { getMessenger, getPortfolio } from '@/lib/cms/queries'

// Same data path as the letter: per request, CMS fetches cached under the `cms` tag.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Desktop', robots: { index: false, follow: false } }

export default async function OsPage() {
  const [portfolio, messenger] = await Promise.all([getPortfolio(), getMessenger()])
  return <Desktop data={{ ...portfolio, messenger }} />
}
