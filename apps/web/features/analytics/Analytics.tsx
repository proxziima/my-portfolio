'use client'
import { useEffect } from 'react'
import { installDelegatedTracking } from '@/lib/analytics/delegated'
import { track } from '@/lib/analytics/events'
import { initPostHog, type ClientAnalyticsConfig } from '@/lib/analytics/init'
import { observeSections } from '@/lib/analytics/sections'

/** Starts analytics for this document; renders nothing. A null config (no token) disables it. */
export function Analytics({ config }: { config: ClientAnalyticsConfig | null }) {
  useEffect(() => {
    if (!config) return
    initPostHog(config, window.self !== window.top)
    const uninstall = installDelegatedTracking(track)
    const stop = observeSections(track)
    return () => {
      uninstall()
      stop()
    }
  }, [config])
  return null
}
