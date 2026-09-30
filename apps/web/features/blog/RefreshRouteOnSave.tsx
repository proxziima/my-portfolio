'use client'

import { RefreshRouteOnSave as PayloadRefreshRouteOnSave } from '@payloadcms/live-preview-react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

/**
 * Server-side Live Preview: when the CMS admin saves or autosaves, Payload posts a message to this
 * iframe and `router.refresh()` re-renders the page, which re-fetches the draft (`no-store`).
 * `cmsOrigin` must be the admin's browser origin; messages from any other origin are ignored.
 */
export function RefreshRouteOnSave({ cmsOrigin }: { cmsOrigin: string }) {
  const router = useRouter()
  const refresh = useCallback(() => router.refresh(), [router])
  return <PayloadRefreshRouteOnSave refresh={refresh} serverURL={cmsOrigin} />
}
