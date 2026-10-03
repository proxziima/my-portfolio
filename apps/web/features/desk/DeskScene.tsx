'use client'
import { useEffect, useRef, useState } from 'react'
import { useInView } from '@/lib/dom/use-in-view'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { OS_PATH } from './config'
import { createDeskEngine, type DeskEngine } from './engine'
import { cappedPixelRatio } from './pixel-ratio'
import { watchScreen } from './screen-events'
import styles from './DeskScene.module.css'

/**
 * The desk in the figure box. Builds the engine once per mount, sizes it to the box, drives the
 * camera from the pointer and the screen's events, and renders only while on screen.
 * `onFail` fires if WebGL is missing or an asset fails, so the figure can collapse to its caption.
 */
export function DeskScene({ onFail }: { onFail: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<DeskEngine | null>(null)
  const [loaded, setLoaded] = useState(false)
  const visible = useInView(hostRef)
  const reduce = useReducedMotion()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let live = true
    let created: DeskEngine
    try {
      created = createDeskEngine({ host, screenSrc: OS_PATH, onFirstFrame: () => { if (live) setLoaded(true) } })
    } catch {
      onFail()
      return
    }
    const engine = created
    const fit = () => {
      engine.resize(host.clientWidth, host.clientHeight)
      engine.setPixelRatio(cappedPixelRatio(window.devicePixelRatio))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(host)
    const unwatch = watchScreen(engine.iframe, (want) => engine.goTo(want ? 'monitor' : 'desk'))
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
      unwatch()
      host.removeEventListener('pointermove', onMove)
      setEngine(null)
      engine.dispose()
    }
  }, [onFail])

  useEffect(() => {
    engine?.setReduceMotion(reduce)
  }, [engine, reduce])

  // nothing to see off screen: no frames at all until the box scrolls back
  useEffect(() => {
    if (!engine) return
    if (visible) engine.start()
    else engine.stop()
  }, [engine, visible])

  return <div ref={hostRef} className={styles.host} data-loaded={loaded} data-anchor="desk-scene" />
}
