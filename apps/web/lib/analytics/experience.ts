import { track, type DeskHost, type Experience, type Track } from './events'

export type { Experience }

/** What an outcome learned that the start could not know (where the desk's WebGL ended up). */
export interface OutcomeExtra {
  host?: DeskHost
}

/** One measurement in flight: the first of `ready` or `failed` is reported, later calls are ignored. */
export interface ExperienceTimer {
  ready(extra?: OutcomeExtra): void
  failed(reason: string, extra?: OutcomeExtra): void
}

/**
 * Starts timing an experience from now, for its load-time (`experience_ready.ms`, whole milliseconds)
 * and failure (`experience_failed.reason`) insights. `extra` rides along on either event (the DOS app id),
 * and each outcome can add its own (the desk's host).
 */
export function startExperience(
  experience: Experience,
  extra: { app?: string } = {},
  { send = track, now = () => performance.now() }: { send?: Track; now?: () => number } = {},
): ExperienceTimer {
  const start = now()
  let settled = false
  /** True the first time only, so an experience is reported once whatever calls in later. */
  const settle = () => !settled && (settled = true)
  return {
    ready: (outcome = {}) => {
      if (settle()) send('experience_ready', { experience, ms: Math.round(now() - start), ...extra, ...outcome })
    },
    failed: (reason, outcome = {}) => {
      if (settle()) send('experience_failed', { experience, reason, ...extra, ...outcome })
    },
  }
}
