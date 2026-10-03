import type { ReactNode } from 'react'
import '@/features/os/os.css'

/** The OS's own root layout: no fonts, no theme script, none of the letter's page styles. */
export default function OsLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
