'use client'

import { useEffect } from 'react'
import { captureException } from '@/lib/analytics/events'

/** Last-resort boundary (the root layout itself failed): report it and render a bare page. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    captureException(error)
  }, [error])
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went quiet.</h1>
          <button type="button" onClick={() => retry()}>Try again</button>
        </main>
      </body>
    </html>
  )
}
