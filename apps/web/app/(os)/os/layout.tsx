import type { ReactNode } from 'react'
import '@/features/os/os.css'

/** The OS's own root layout: no fonts, no theme script, none of the letter's page styles. */
export default function OsLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* the OS is iframed on the monitor: any relative link must leave the frame, not nest the site inside it */}
      <head>
        <base target="_top" />
      </head>
      <body>{children}</body>
    </html>
  )
}
