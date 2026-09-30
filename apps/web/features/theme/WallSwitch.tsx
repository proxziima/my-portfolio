'use client'
import { forwardRef, useEffect, useRef } from 'react'
import { playClick } from '@/lib/audio/click'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { applyTheme, currentTheme, stampThemeTransition } from './theme-dom'
import { useRocker } from './use-rocker'
import { useTheme } from './use-theme'
import styles from './WallSwitch.module.css'

const RAPID_MS = 300

interface Props {
  /** true while the blowout owns the switch */
  disabled?: () => boolean
  onToggled?: () => void
}

export const WallSwitch = forwardRef<HTMLDivElement, Props>(function WallSwitch({ disabled, onToggled }, ref) {
  const theme = useTheme()
  const reduce = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { ready, flipTo } = useRocker(canvasRef, theme === 'dark' ? 1 : 0, reduce)
  const lastToggle = useRef(0)

  // Keep the rocker on the right frame when the theme changes from outside (system, other tab, blowout).
  // It reads the DOM rather than the hook value: while hydrating, `theme` is still the server's 'light',
  // and the first sync must jump so a dark page doesn't flip on load.
  const synced = useRef(false)
  useEffect(() => {
    flipTo(currentTheme() === 'dark' ? 1 : 0, false, !synced.current)
    synced.current = true
  }, [theme, flipTo])

  const onClick = () => {
    if (disabled?.()) return
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    const t = performance.now()
    const rapid = t - lastToggle.current < RAPID_MS
    lastToggle.current = t
    if (!reduce) stampThemeTransition()
    applyTheme(next)
    playClick(next)
    flipTo(next === 'dark' ? 1 : 0, rapid)
    onToggled?.()
  }

  const dark = theme === 'dark'
  return (
    <div ref={ref} className={styles.switcher} data-anchor="switch">
      <button
        type="button"
        className={styles.toggle}
        onClick={onClick}
        aria-pressed={dark}
        aria-label={dark ? 'Turn the lights on' : 'Turn the lights off'}
      >
        <span className={styles.stage} data-motion-ready={ready} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- no-canvas fallback frames, sized by CSS */}
          <img className={`${styles.image} ${styles.state} ${styles.light}`} src="/theme-switch/rocker-on.webp" alt="" width={530} height={700} decoding="async" />
          {/* eslint-disable-next-line @next/next/no-img-element -- no-canvas fallback frames, sized by CSS */}
          <img className={`${styles.image} ${styles.state} ${styles.dark}`} src="/theme-switch/rocker-off.webp" alt="" width={530} height={700} decoding="async" />
          <canvas ref={canvasRef} className={`${styles.image} ${styles.motion}`} width={212} height={280} />
        </span>
      </button>
    </div>
  )
})
