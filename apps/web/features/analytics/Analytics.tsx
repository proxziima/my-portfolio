'use client'
import { useEffect } from 'react'
import { installDelegatedTracking } from '@/lib/analytics/delegated'
import { track, trackOnExit } from '@/lib/analytics/events'
import { initPostHog, type ClientAnalyticsConfig } from '@/lib/analytics/init'
import { trackOsEngagement } from '@/lib/analytics/os-engagement'
import { trackSectionEngagement } from '@/lib/analytics/section-engagement'
import { observeSections } from '@/lib/analytics/sections'

/** Which root layout mounts this: the one-page site (sections) or the /os desktop. */
export type AnalyticsSurface = 'site' | 'os'

/** Per-surface trackers; each returns its stopper. */
function installSurface(surface: AnalyticsSurface, embedded: boolean): Array<() => void> {
  if (surface === 'os') return [trackOsEngagement(trackOnExit, embedded)]
  return [observeSections(track), trackSectionEngagement(trackOnExit)]
}

/**
 * Starts analytics for this document; renders nothing. A null config (no token) disables it. The
 * effect keys on the values, not the object: a parent re-render passes an equal but new object,
 * which must not tear down and reinstall the listeners.
 */
export function Analytics({ config, surface }: { config: ClientAnalyticsConfig | null; surface: AnalyticsSurface }) {
  const token = config?.token
  const uiHost = config?.uiHost
  useEffect(() => {
    if (!token || !uiHost) return
    // the /os desktop iframed on the desk monitor
    const embedded = window.self !== window.top
    initPostHog({ token, uiHost }, embedded)
    const stoppers = [installDelegatedTracking(track), ...installSurface(surface, embedded)]
    return () => stoppers.forEach((stop) => stop())
  }, [token, uiHost, surface])
  return null
}
