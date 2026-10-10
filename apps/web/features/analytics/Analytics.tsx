'use client'
import { useEffect } from 'react'
import { installDelegatedTracking } from '@/lib/analytics/delegated'
import { track } from '@/lib/analytics/events'
import { initPostHog, type ClientAnalyticsConfig } from '@/lib/analytics/init'
import { observeSections } from '@/lib/analytics/sections'

/**
 * Starts analytics for this document; renders nothing. A null config (no token) disables it. The
 * effect keys on the values, not the object: a parent re-render passes an equal but new object,
 * which must not tear down and reinstall the listeners.
 */
export function Analytics({ config }: { config: ClientAnalyticsConfig | null }) {
  const token = config?.token
  const uiHost = config?.uiHost
  useEffect(() => {
    if (!token || !uiHost) return
    initPostHog({ token, uiHost }, window.self !== window.top)
    const uninstall = installDelegatedTracking(track)
    const stop = observeSections(track)
    return () => {
      uninstall()
      stop()
    }
  }, [token, uiHost])
  return null
}
