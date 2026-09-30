'use client'
import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

const subscribe = (onChange: () => void) => {
  const mq = matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Live `prefers-reduced-motion`; false on the server. */
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches, () => false)
