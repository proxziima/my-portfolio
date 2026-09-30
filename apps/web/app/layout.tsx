import type { ReactNode } from 'react'
import { Caveat, Inter } from 'next/font/google'
import { ThemeScript } from '@/features/theme/ThemeScript'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-caveat', display: 'swap' })

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <div id="flick" aria-hidden="true" />
        {children}
      </body>
    </html>
  )
}
