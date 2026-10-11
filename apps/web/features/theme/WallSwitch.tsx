'use client'
import { forwardRef, useEffect, useRef } from 'react'
import { ASSETS, type ImageAsset } from '@/lib/assets/manifest'
import { fallbackSrc, srcset } from '@/lib/assets/srcset'
import { playClick } from '@/lib/audio/click'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { applyTheme, currentTheme, stampThemeTransition } from './theme-dom'
import { useRocker } from './use-rocker'
import { useTheme } from './use-theme'
import styles from './WallSwitch.module.css'
import { track } from '@/lib/analytics/events'

const RAPID_MS = 300
/** The switch's layout width (`.switcher` in WallSwitch.module.css): the density pick for the fallback frames. */
const SIZES = '2.8rem'

/** A no-canvas fallback frame: AVIF, else the WebP candidates; sized by CSS. */
function Frame({ asset, className }: { asset: ImageAsset; className: string }) {
  const avif = srcset(asset, 'avif')
  return (
    <picture>
      {avif && <source type="image/avif" srcSet={avif} sizes={SIZES} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- no-canvas fallback frames, sized by CSS */}
      <img className={className} src={fallbackSrc(asset)} srcSet={srcset(asset, 'fallback')} sizes={SIZES} alt="" width={asset.width} height={asset.height} decoding="async" />
    </picture>
  )
}

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
    track('theme_changed', { theme: next })
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
          <Frame asset={ASSETS.theme.rockerOn} className={`${styles.image} ${styles.state} ${styles.light}`} />
          <Frame asset={ASSETS.theme.rockerOff} className={`${styles.image} ${styles.state} ${styles.dark}`} />
          <canvas ref={canvasRef} className={`${styles.image} ${styles.motion}`} width={212} height={280} />
        </span>
      </button>
    </div>
  )
})
