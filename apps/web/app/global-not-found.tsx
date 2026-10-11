import type { Metadata } from 'next'
import { Caveat, Inter } from 'next/font/google'
import { ThemeScript } from '@/features/theme/ThemeScript'
import './globals.css'

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
