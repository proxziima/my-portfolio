'use client'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { preloadBulb } from '@/lib/audio/bulb'
import { createClickWindow } from './click-window'
import { runBlowout } from './sequence'

const FLICKER_MS = 420

/**
 * Flick the switch too fast and the bulb goes. `register` is the switch's `onToggled`,
 * `isActive` its `disabled`: clicks are ignored while the sequence runs.
 * The consumer imports `blowout.css` (global: the sequence creates its elements imperatively).
 */
export function useBlowout(switchRef: RefObject<HTMLElement | null>, reduce: boolean) {
  const [clicks] = useState(createClickWindow)
  const active = useRef(false)
  const run = useRef<AbortController | null>(null)
  const flickerTimer = useRef(0)

  const flicker = useCallback((level: number) => {
    if (reduce) return
    const root = document.documentElement
    root.setAttribute('data-flicker', String(level))
    window.clearTimeout(flickerTimer.current)
    flickerTimer.current = window.setTimeout(() => root.removeAttribute('data-flicker'), FLICKER_MS)
  }, [reduce])

  const register = useCallback(() => {
    const switchEl = switchRef.current
    if (active.current || !switchEl) return
    const result = clicks.register(performance.now())
    // from the 2nd fast click on, so a failed decode gets another go (the reference retries too)
    if (result.kind === 'preload' || result.kind === 'flicker') preloadBulb()
    if (result.kind === 'flicker') flicker(result.level)
    if (result.kind !== 'blow') return
    active.current = true
    const controller = new AbortController()
    run.current = controller
    const done = () => {
      if (run.current === controller) run.current = null
      active.current = false
    }
    let sequence: Promise<void>
    try {
      sequence = runBlowout({ switchEl, reduce, signal: controller.signal })
    } catch (error) {
      sequence = Promise.reject(error)
    }
    // the blowout is decoration: a failure puts the room back (runBlowout does) and frees the switch
    void sequence.catch(() => {}).finally(done)
  }, [switchRef, clicks, reduce, flicker])

  // unmounting mid-sequence still removes every leftover and puts the room back
  useEffect(() => () => {
    run.current?.abort()
    window.clearTimeout(flickerTimer.current)
    document.documentElement.removeAttribute('data-flicker')
  }, [])

  const isActive = useCallback(() => active.current, [])
  return { register, isActive }
}
