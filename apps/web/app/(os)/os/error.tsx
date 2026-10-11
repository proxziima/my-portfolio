'use client'

import posthog from 'posthog-js'
import { useEffect } from 'react'

/** The desktop crashed: report it and offer a reboot instead of a blank monitor. */
export default function OsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    posthog.captureException(error)
  }, [error])
  return (
    <main style={{ padding: 24, fontFamily: 'var(--os-serif, serif)' }}>
      <p>The desktop stopped responding.</p>
      <button type="button" onClick={() => retry()}>Restart</button>
    </main>
  )
}
