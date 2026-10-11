'use client'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ATLAS, flipDuration, frameAt, frameOrigin, isValidAtlas, smoothstep } from './rocker-atlas'

/** The decoded atlas, whichever way it was decoded. */
type Atlas = { source: CanvasImageSource; width: number; height: number; release(): void }

/**
 * Decodes the atlas off the main thread: `createImageBitmap` on the fetched bytes, with its default
 * options, which give drawImage the same pixels as an `<img>` would. Where it is missing, an
 * `<img>`'s `decode()`, which is also asynchronous but leaves the first draw to decode on the main
 * thread in some engines.
 */
async function decodeAtlas(src: string): Promise<Atlas> {
  if (typeof createImageBitmap === 'function') {
    // an <img> would load it at low priority; fetch() defaults to high and would compete with the page's own resources
    const response = await fetch(src, { priority: 'low' })
    if (!response.ok) throw new Error(`rocker atlas: HTTP ${response.status}`)
    const bitmap = await createImageBitmap(await response.blob())
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  }
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode()
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} }
}

/** Draws the rocker from the atlas onto a canvas. Until the atlas is valid, `ready` stays false and the `<img>` fallback shows. */
export function useRocker(canvasRef: RefObject<HTMLCanvasElement | null>, initial: 0 | 1, reduce: boolean) {
  const atlas = useRef<Atlas | null>(null)
  const [ready, setReady] = useState(false)
  const now = useRef<number>(initial)
  const target = useRef<number>(initial)
  const raf = useRef(0)

  const draw = useCallback((p: number) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !atlas.current) return
    const { sx, sy } = frameOrigin(frameAt(p))
    ctx.clearRect(0, 0, ATLAS.width, ATLAS.height)
    ctx.drawImage(atlas.current.source, sx, sy, ATLAS.width, ATLAS.height, 0, 0, ATLAS.width, ATLAS.height)
    now.current = p
  }, [canvasRef])

  useEffect(() => {
    let cancelled = false
    decodeAtlas(ATLAS.src).then((decoded) => {
      if (cancelled || !isValidAtlas(decoded.width, decoded.height)) {
        decoded.release()
        if (!cancelled) setReady(false)
        return
      }
      atlas.current = decoded
      draw(now.current)
      setReady(true)
    }).catch(() => { if (!cancelled) setReady(false) })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf.current)
      raf.current = 0
      atlas.current?.release()
      atlas.current = null
    }
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
