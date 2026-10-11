'use client'

import { useEffect } from 'react'
import { captureException } from '@/lib/analytics/events'
import { PreviewNotice } from '@/features/blog/PreviewNotice'

// Only reachable in draft mode (the page 404s otherwise), so this always talks to an editor.
export default function PreviewError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    captureException(error)
  }, [error])
  return (
    <PreviewNotice title="Preview couldn't load">
      The CMS didn&rsquo;t answer in time or returned an error. Re-open the preview from the post in the CMS.
    </PreviewNotice>
  )
}
