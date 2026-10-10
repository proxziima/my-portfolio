import { createEngagementClock, installActivityListeners, onPageExit, reportableSeconds } from './engagement'
import type { Track } from './events'

/** Apps opened since the last report: module state, because `Desktop` and the tracker never meet. */
let appsOpened = 0

/** Counts one app opened by the visitor, for the next `os_engaged`. Called next to `os_app_opened`. */
export function countAppOpen(): void {
  appsOpened++
}

/**
 * Engaged time on the /os desktop, standalone or iframed on the desk monitor (`embedded`, whose
 * pageleave is off). The clock runs while the document is visible; input is only heard inside the OS
 * document. Embedded, neither the iframe loading nor the tab returning counts as use (the visitor came
 * for the page, the monitor just happens to be there), so only input in the OS does. Each page exit
 * reports `os_engaged`, then resets. Returns the stopper.
 */
export function trackOsEngagement(sendOnExit: Track, embedded: boolean): () => void {
  const clock = createEngagementClock(undefined, !embedded)
  const onVisibility = () => {
    const visible = document.visibilityState === 'visible'
    clock.setActive(visible)
    if (visible && !embedded) clock.activity()
  }
  const flush = () => {
    const seconds = reportableSeconds(clock.seconds())
    const apps_opened = appsOpened
    clock.reset()
    appsOpened = 0
    if (seconds !== null) sendOnExit('os_engaged', { seconds, embedded, apps_opened })
  }
  clock.setActive(document.visibilityState === 'visible')
  document.addEventListener('visibilitychange', onVisibility)
  const uninstallActivity = installActivityListeners(() => clock.activity())
  const uninstallExit = onPageExit(flush)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    uninstallActivity()
    uninstallExit()
  }
}
