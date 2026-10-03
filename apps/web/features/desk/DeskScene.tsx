'use client'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useInView } from '@/lib/dom/use-in-view'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { createDeskAudio, type DeskAudio } from './audio'
import { OS_PATH } from './config'
import { createDeskEngine, type DeskEngine } from './engine'
import { noiseDataUrl } from './noise'
import { cappedPixelRatio } from './pixel-ratio'
import { watchScreen } from './screen-events'
import styles from './DeskScene.module.css'
// global: the screen's DOM is built imperatively, so its CRT layers cannot take module class names
import './screen-fx.css'

/**
 * The desk in the figure box. Builds the engine once per mount, sizes it to the box, drives the
 * camera from the pointer and the screen's events, and renders only while on screen. It also owns
 * the scene's sounds: key and mouse foley for what happens inside the OS, a startup chime and an
 * office ambience that muffles as the camera zooms in, all silent until the first gesture and
 * whenever `muted`. `onFail` fires if WebGL is missing or an asset fails, so the figure can
 * collapse to its caption.
 */
export function DeskScene({ onFail, muted }: { onFail: () => void; muted: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<DeskAudio | null>(null)
  const [engine, setEngine] = useState<DeskEngine | null>(null)
  const [loaded, setLoaded] = useState(false)
  const visible = useInView(hostRef)
  const reduce = useReducedMotion()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let live = true
    const audio = createDeskAudio()
    let created: DeskEngine
    try {
      created = createDeskEngine({
        host,
        screenSrc: OS_PATH,
        onFirstFrame: () => { if (live) setLoaded(true) },
        onFrame: (distance) => audio.setDistance(distance),
      })
    } catch {
      audio.dispose()
      onFail()
      return
    }
    audioRef.current = audio
    const engine = created
    const fit = () => {
      engine.resize(host.clientWidth, host.clientHeight)
      engine.setPixelRatio(cappedPixelRatio(window.devicePixelRatio))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(host)
    // a DPR change (window moved to another screen) does not resize the box: watch the media query
    let dprQuery: MediaQueryList | null = null
    function onDpr() {
      fit()
      watchDpr()
    }
    function watchDpr() {
      dprQuery?.removeEventListener('change', onDpr)
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      dprQuery.addEventListener('change', onDpr)
    }
    watchDpr()
    const unlock = () => audio.unlock()
    const unwatch = watchScreen(
      engine.iframe,
      (want) => engine.goTo(want ? 'monitor' : 'desk'),
      (input) => {
        unlock()
        if (input.type === 'pointerdown') audio.mouse('down')
        else if (input.type === 'pointerup') audio.mouse('up')
        else if (input.type === 'keydown') audio.key(input.key, input.repeat)
        else audio.keyUp()
      },
    )
    // a press on the desk itself also counts as the gesture that may start sound
    host.addEventListener('pointerdown', unlock)
    host.addEventListener('keydown', unlock)
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      engine.setPointer({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 })
    }
    host.addEventListener('pointermove', onMove)
    engine.load().catch(() => { if (live) onFail() })
    setEngine(engine)
    return () => {
      live = false
      ro.disconnect()
      dprQuery?.removeEventListener('change', onDpr)
      unwatch()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerdown', unlock)
      host.removeEventListener('keydown', unlock)
      audio.dispose()
      audioRef.current = null
      setEngine(null)
      engine.dispose()
    }
  }, [onFail])

  // depends on `engine` too: the audio is created with it, so the choice is re-applied once it exists
  useEffect(() => {
    audioRef.current?.setMuted(muted)
  }, [engine, muted])

  useEffect(() => {
    engine?.setReduceMotion(reduce)
  }, [engine, reduce])

  // nothing to see off screen: no frames at all until the box scrolls back
  useEffect(() => {
    if (!engine) return
    if (visible) engine.start()
    else engine.stop()
  }, [engine, visible])

  // one noise tile for the screen's static and the grain; the scene is client-only (no SSR), so `document` exists
  const noise = useMemo(() => noiseDataUrl(), [])
  const hostStyle = useMemo(() => (noise ? ({ '--noise': `url(${noise})` }) as CSSProperties : undefined), [noise])

  // the grain is a React child beside the engine's two layers: the engine appends them, it never replaces the host's children
  return (
    <div ref={hostRef} className={styles.host} style={hostStyle} data-loaded={loaded} data-anchor="desk-scene">
      <div className={styles.grain} aria-hidden="true" />
    </div>
  )
}
