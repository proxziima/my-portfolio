'use client'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ATLAS, flipDuration, frameAt, frameOrigin, isValidAtlas, smoothstep } from './rocker-atlas'

/** Draws the rocker from the atlas onto a canvas. Until the atlas is valid, `ready` stays false and the `<img>` fallback shows. */
export function useRocker(canvasRef: RefObject<HTMLCanvasElement | null>, initial: 0 | 1, reduce: boolean) {
  const atlas = useRef<HTMLImageElement | null>(null)
  const [ready, setReady] = useState(false)
  const now = useRef<number>(initial)
  const target = useRef<number>(initial)
  const raf = useRef(0)

  const draw = useCallback((p: number) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !atlas.current) return
    const { sx, sy } = frameOrigin(frameAt(p))
    ctx.clearRect(0, 0, ATLAS.width, ATLAS.height)
    ctx.drawImage(atlas.current, sx, sy, ATLAS.width, ATLAS.height, 0, 0, ATLAS.width, ATLAS.height)
    now.current = p
  }, [canvasRef])

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.src = ATLAS.src
    img.decode().then(() => {
      if (cancelled) return
      if (!isValidAtlas(img.naturalWidth, img.naturalHeight)) throw new Error('invalid rocker atlas')
      atlas.current = img
      draw(now.current)
      setReady(true)
    }).catch(() => { if (!cancelled) setReady(false) })
    return () => { cancelled = true; cancelAnimationFrame(raf.current); raf.current = 0 }
  }, [draw])

  /** `instant` jumps (first sync after hydration); a flip already heading to `to` is left alone. */
  const flipTo = useCallback((to: 0 | 1, rapid = false, instant = false) => {
    if (raf.current && target.current === to) return
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; draw(target.current) }
    target.current = to
    if (!atlas.current || reduce || instant || now.current === to) { now.current = to; draw(to); return }
    const from = now.current, start = performance.now(), duration = flipDuration(to - from, rapid)
    const tick = (t: number) => {
      const o = Math.min(1, Math.max(0, (t - start) / duration))
      draw(from + (to - from) * smoothstep(o))
      raf.current = o < 1 ? requestAnimationFrame(tick) : 0
    }
    raf.current = requestAnimationFrame(tick)
  }, [draw, reduce])

  return { ready, flipTo }
}
