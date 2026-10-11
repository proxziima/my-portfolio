import type { Metadata } from 'next'
import { Caveat, Inter } from 'next/font/google'
import { ThemeScript } from '@/features/theme/ThemeScript'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-caveat', display: 'swap' })

export const metadata: Metadata = { title: 'Not found', robots: { index: false } }

/** The 404 for URLs no route matches. Two root layouts means no shared layout to wrap one, so this renders its own document (plain anchor: no router needed). */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${inter.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <main>
          <h1><span className="who">Nothing here.</span></h1>
          <p>
            This page doesn&rsquo;t exist. <a href="/">Back to the letter</a>
          </p>
        </main>
      </body>
    </html>
  )
}
