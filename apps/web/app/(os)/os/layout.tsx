import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import { Ultra } from 'next/font/google'
import '@/features/os/os.css'

/** The reference Showcase's text face (Millennium, regular and bold). */
const serif = localFont({
  src: [
    { path: '../fonts/Millennium.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/Millennium-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--os-serif',
  display: 'swap',
})

/** Stand-in for the reference's display face (gastromond, an Adobe Fonts kit we cannot load). */
const display = Ultra({ subsets: ['latin'], weight: '400', variable: '--os-display', display: 'swap' })

/** The OS's own root layout: no theme script, none of the letter's page styles; only the Showcase's faces. */
export default function OsLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${display.variable}`}>
      {/* the OS is iframed on the monitor: any relative link must leave the frame, not nest the site inside it */}
      <head>
        <base target="_top" />
      </head>
      <body>{children}</body>
    </html>
  )
}
