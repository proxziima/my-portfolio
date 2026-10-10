import type { Metadata } from 'next'
import { Caveat, Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { preconnect } from 'react-dom'
import { Analytics } from '@/features/analytics/Analytics'
import { ThemeScript } from '@/features/theme/ThemeScript'
import { clientAnalyticsConfig } from '@/lib/analytics/request'
import { originOf, siteUrl } from '@/lib/site'
import '../globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-caveat', display: 'swap' })

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(siteUrl()),
    openGraph: { type: 'website', locale: 'en_US' },
    twitter: { card: 'summary_large_image' },
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // CMS uploads (favicons, OG image) load from the CMS origin: open the connection early.
  const cms = originOf(process.env.CMS_URL)
  if (cms && cms !== originOf(siteUrl())) preconnect(cms)
  return (
    <html lang="en" className={`${inter.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <div id="flick" aria-hidden="true" />
        {children}
        <Analytics config={clientAnalyticsConfig()} />
      </body>
    </html>
  )
}
