'use client'
import { Application } from '@splinetool/runtime'
import { useEffect, useRef, useState } from 'react'

/**
 * The Spline scene, client-only, driven through the runtime directly rather than
 * `@splinetool/react-spline`, for two things the wrapper doesn't expose:
 * - `renderer: 'webgl'`: on the auto-selected WebGPU pipeline this scene logs pipeline and
 *   shadow-texture validation errors (and drops two draws); the WebGL pipeline renders it cleanly
 * - a load rejection (missing file, unparsable scene), which the wrapper rethrows during render.
 *   `onFail` lets the figure collapse to its caption.
 */
export function SplineScene({ url, onFail }: { url: string; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let live = true
    let app: Application | undefined
    try {
      app = new Application(canvas, { renderMode: 'auto', renderer: 'webgl' })
      app.load(url).then(
        () => { if (live) setLoaded(true) },
        () => { if (live) onFail() },
      )
    } catch {
      onFail()
    }
    return () => {
      live = false
      app?.dispose()
    }
  }, [url, onFail])

  return <canvas ref={canvasRef} data-loaded={loaded} aria-hidden="true" />
}
