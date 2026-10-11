'use client'
import { useEffect, useReducer, useRef, useState } from 'react'
import { textureFormat } from '@/lib/assets/texture-format'
import { useInView } from '@/lib/dom/use-in-view'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { deskAssetUrls } from './assets'
import { createDeskAudio, type DeskAudio } from './audio'
import { DESK_ASSETS, OS_PATH } from './config'
import { createDeskEngine, type DeskEngine } from './engine'
import { createMainHost } from './gl/main-host'
import { watchApproach } from './intent'
import { cappedPixelRatio } from './pixel-ratio'
import { reducePower, type Power } from './power'
import { watchScreen } from './screen-events'
import styles from './DeskScene.module.css'
// global: the screen's DOM is built imperatively, so its CRT layers cannot take module class names
import './screen-fx.css'

/** Why the scene gave up, for `experience_failed.reason`. */
export type DeskFailure = 'webgl_unavailable' | 'load_error'

export interface DeskSceneProps {
  onFail: (reason: DeskFailure) => void
  onReady: () => void
  muted: boolean
  /** The figure is in full screen: that is there to use the OS, so it boots the monitor. */
  fullscreen: boolean
  /** The monitor's power as it changes, for the figure (full screen rebinds to the late iframe). */
  onPower: (power: Power) => void
}

/**
 * The desk in the figure box. Builds the engine once per mount, sizes it to the box, drives the
 * camera from the pointer and the screen's events, and renders only while on screen. It owns the
 * monitor's power: the screen is a dark tube until the visitor approaches (`watchApproach`: the
 * pointer entering the box, keyboard focus on the screen, on touch the box half in view) or the
 * figure goes full screen; then the OS boots, its own boot console being the loading state. It also
 * owns the scene's sounds: key and mouse foley for what happens inside the OS, a startup chime and
 * an office ambience that muffles as the camera zooms in, all silent until the first gesture and
 * whenever `muted`. `onFail` fires if WebGL is missing or an asset fails, so the figure can
 * collapse to its caption; `onReady` fires on the first frame drawn with the models.
 */
export function DeskScene({ onFail, onReady, muted, fullscreen, onPower }: DeskSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<DeskAudio | null>(null)
  const [engine, setEngine] = useState<DeskEngine | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [power, dispatchPower] = useReducer(reducePower, 'off')
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
        container: host,
        host: createMainHost(textureFormat().then((format) => deskAssetUrls(DESK_ASSETS, format))),
        screenSrc: OS_PATH,
        onFirstFrame: () => {
          if (!live) return
          setLoaded(true)
          onReady()
        },
        onFrame: (distance) => audio.setDistance(distance),
      })
    } catch {
      audio.dispose()
      onFail('webgl_unavailable')
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
    // read once: a device does not grow or lose hover while the page is open
    const touch = window.matchMedia('(hover: none)').matches
    // the figure box: the host fills it, and the pointer enters it well before it reaches the screen
    const box = host.parentElement ?? host
    const stopApproach = watchApproach(box, engine.screen.element, touch, (source) => dispatchPower({ type: 'intent', source }))
    const offLoaded = engine.screen.onLoaded(() => {
      if (live) dispatchPower({ type: 'loaded' })
    })
    const unwatch = watchScreen(
      engine.screen.element,
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
    engine.load().catch(() => { if (live) onFail('load_error') })
    setEngine(engine)
    return () => {
      live = false
      ro.disconnect()
      dprQuery?.removeEventListener('change', onDpr)
      unwatch()
      stopApproach()
      offLoaded()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerdown', unlock)
      host.removeEventListener('keydown', unlock)
      audio.dispose()
      audioRef.current = null
      setEngine(null)
      engine.dispose()
    }
  }, [onFail, onReady])

  // powerOn is idempotent: an engine rebuilt while powered (a remount) boots its own screen again
  useEffect(() => {
    if (engine && power !== 'off') engine.screen.powerOn()
  }, [engine, power])

  useEffect(() => {
    onPower(power)
  }, [power, onPower])

  useEffect(() => {
    if (fullscreen) dispatchPower({ type: 'intent', source: 'fullscreen' })
  }, [fullscreen])

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

  return <div ref={hostRef} className={styles.host} data-loaded={loaded} data-power={power} data-anchor="desk-scene" />
}
