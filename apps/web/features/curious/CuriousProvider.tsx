'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'curious'

interface CuriousValue {
  on: boolean
  toggle: () => void
}

const CuriousContext = createContext<CuriousValue | null>(null)

export function CuriousProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  // never write to storage before it has been read
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      setOn(localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      /* storage unavailable */
    }
    setReady(true)
  }, [])

  const toggle = useCallback(() => setOn((v) => !v), [])

  useEffect(() => {
    document.documentElement.toggleAttribute('data-curious', on)
    if (!ready) return
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  }, [on, ready])

  const value = useMemo(() => ({ on, toggle }), [on, toggle])
  return <CuriousContext.Provider value={value}>{children}</CuriousContext.Provider>
}

export function useCurious(): CuriousValue {
  const v = useContext(CuriousContext)
  if (!v) throw new Error('useCurious must be used inside <CuriousProvider>')
  return v
}
