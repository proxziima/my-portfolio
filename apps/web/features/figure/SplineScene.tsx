'use client'
import { Application } from '@splinetool/runtime'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useFitScale } from './use-fit-scale'
import styles from './SplineScene.module.css'

/** The frame the scene is composed for: the desktop column at 3:2. */
const FRAME = { width: 600, height: 400 }
/**
 * How far the camera pulls back from that frame (< 1 shows more). Not `app.setZoom`: the scene's
 * camera is orthographic, where `setZoom` sets an absolute zoom clamped to the scene's limits
 * (0.3–0.48 around its 0.35), so it can't pull back this far. The stage renders the frame / zoom
 * instead and is scaled into the box.
 */
const SCENE_ZOOM = 0.7
const STAGE = { width: FRAME.width / SCENE_ZOOM, height: FRAME.height / SCENE_ZOOM }

/**
 * The Spline scene, client-only, driven through the runtime directly rather than
 * `@splinetool/react-spline`, for two things the wrapper doesn't expose:
 * - `renderer: 'webgl'`: on the auto-selected WebGPU pipeline this scene logs pipeline and
 *   shadow-texture validation errors (and drops two draws); the WebGL pipeline renders it cleanly
 * - a load rejection (missing file, unparsable scene), which the wrapper rethrows during render.
 *   `onFail` lets the figure collapse to its caption.
 */
export function SplineScene({ url, onFail }: { url: string; onFail: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState(false)
  const fit = useFitScale(stageRef, STAGE.width)

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

  return (
    <div ref={stageRef} className={styles.stage} style={{ ...STAGE, '--fit': fit } as CSSProperties}>
      <canvas ref={canvasRef} data-loaded={loaded} aria-hidden="true" />
    </div>
  )
}
