'use client'
import { useRef, useState } from 'react'
import { startExperience, type Experience, type ExperienceTimer } from './experience'

/**
 * Times `experience` from the first render where `active` is true, once per mount (a later
 * re-activation is not a second load). The returned timer is stable across renders and ignores
 * calls made before the start.
 */
export function useExperience(experience: Experience, { active = true, app }: { active?: boolean; app?: string } = {}): ExperienceTimer {
  const timer = useRef<ExperienceTimer | null>(null)
  // started during render (a lazy ref init), not in an effect: a child's effects run before the
  // parent's, and the child is what settles it (a scene that fails as it mounts)
  if (active && timer.current === null) timer.current = startExperience(experience, app === undefined ? {} : { app })
  const [stable] = useState<ExperienceTimer>(() => ({
    ready: (extra) => timer.current?.ready(extra),
    failed: (reason, extra) => timer.current?.failed(reason, extra),
  }))
  return stable
}
