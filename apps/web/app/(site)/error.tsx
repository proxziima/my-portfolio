'use client'

import { useEffect } from 'react'
import { captureException } from '@/lib/analytics/events'

/** The CMS could not be reached: a quiet, letter-styled note with a retry that re-fetches. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    captureException(error)
  }, [error])
  return (
    <main>
      <h1><span className="who">Something went quiet.</span></h1>
      <p>
        The content could not be loaded. <button type="button" onClick={() => retry()}>Try again</button>
      </p>
    </main>
  )
}
