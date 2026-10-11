import type { Metadata } from 'next'
import { Caveat, Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { preconnect } from 'react-dom'
import { Analytics } from '@/features/analytics/Analytics'
import { ThemeScript } from '@/features/theme/ThemeScript'
import { clientAnalyticsConfig } from '@/lib/analytics/request'
import { originOf, siteUrl } from '@/lib/site'
import '../globals.css'

// `optional` (spec §4.1): the preloaded Inter is there for the first paint on a normal load, and a load that misses it
// keeps the fallback for the page's life, so the letter never re-wraps under the reader. The matched per-platform
// fallbacks (styles/font-fallbacks.css) make that rare view look as close to Inter as a system face can, and replace
// next/font's single Arial one; Turbopack ignores `adjustFontFallback: false` unless `fallback` is given, so both are
// set (literals: next/font reads them statically)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'optional',
  adjustFontFallback: false,
  fallback: ['Inter Fallback Segoe', 'Inter Fallback Roboto', 'Inter Fallback Helvetica', 'Inter Fallback Arial'],
})
// only Curious mode's notes use it: never preload it ahead of the body face. `swap`, not `optional`: it is fetched when the
// notes first render, past any block period, so `optional` would show the notes in the fallback; its swap moves only the
// notes, which are out of flow (spec §4.1)
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-caveat', display: 'swap', preload: false })

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
        <Analytics config={clientAnalyticsConfig()} surface="site" />
      </body>
    </html>
  )
}
