'use client'
import { useEffect, useState } from 'react'

export interface TypewriterOptions {
  charMs?: number
  /** The pause after a line is complete, before the next starts (and before `onDone`). */
  lineMs?: number
  /** Reduced motion: show every line at once. */
  instant?: boolean
  onDone?: () => void
}

/**
 * The lines typed so far, one character per `charMs`. `lines` and `onDone` must be stable
 * (module constants, `useMemo`, `useCallback`): a new identity restarts the typing.
 */
export function useTypewriter(lines: readonly string[], { charMs = 14, lineMs = 160, instant = false, onDone }: TypewriterOptions = {}): string[] {
  const [shown, setShown] = useState<string[]>(() => (instant ? [...lines] : []))

  useEffect(() => {
    if (instant) {
      setShown([...lines])
      onDone?.()
      return
    }
    let line = 0
    let char = 0
    let timer = 0
    const tick = () => {
      if (line >= lines.length) {
        onDone?.()
        return
      }
      const text = lines[line] ?? ''
      char++
      const typed = text.slice(0, char)
      const at = line
      setShown((prev) => [...prev.slice(0, at), typed])
      if (char >= text.length) {
        line++
        char = 0
        timer = window.setTimeout(tick, lineMs)
      } else {
        timer = window.setTimeout(tick, charMs)
      }
    }
    timer = window.setTimeout(tick, charMs)
    return () => window.clearTimeout(timer)
  }, [lines, charMs, lineMs, instant, onDone])

  return shown
}
