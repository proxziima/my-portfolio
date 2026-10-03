'use client'
import { useCallback, useEffect, useState } from 'react'

export const MUTED_KEY = 'desk-muted'

/** Sound on by default, as the reference after its START click; the choice sticks per browser. */
export function useMuted(): [boolean, () => void] {
  const [muted, setMuted] = useState(false)
  // never write to storage before it has been read (same pattern as CuriousProvider)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTED_KEY) === '1')
    } catch {
      /* storage unavailable */
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(MUTED_KEY, muted ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  }, [muted, ready])

  const toggle = useCallback(() => setMuted((m) => !m), [])
  return [muted, toggle]
}
