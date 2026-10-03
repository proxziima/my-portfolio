'use client'
import { Application } from '@splinetool/runtime'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useInView } from '@/lib/dom/use-in-view'
import { applyPixelRatio, scenePixelRatio } from './scene-pixel-ratio'
import { useFitScale } from './use-fit-scale'
import { useHideSplineTextProxy } from './use-hide-spline-text-proxy'
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
/**
 * About 857×571 CSS px, scaled into the box by `fit`. Its WebGL buffer is sized to the device pixels it
 * covers after that scaling, not to the full stage × devicePixelRatio (see scene-pixel-ratio.ts).
 */
const STAGE = { width: FRAME.width / SCENE_ZOOM, height: FRAME.height / SCENE_ZOOM }

/**
 * The Spline scene, client-only, driven through the runtime directly rather than
 * `@splinetool/react-spline`, for what the wrapper doesn't expose:
 * - `renderer: 'webgl'`: on the auto-selected WebGPU pipeline this scene logs pipeline and
 *   shadow-texture validation errors (and drops two draws); the WebGL pipeline renders it cleanly
 * - a load rejection (missing file, unparsable scene), which the wrapper rethrows during render.
 *   `onFail` lets the figure collapse to its caption
 * - the loaded app itself: its pixel ratio follows the fit, and it stops rendering while off screen.
 */
export function SplineScene({ url, onFail }: { url: string; onFail: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [app, setApp] = useState<Application | null>(null)
  const fit = useFitScale(stageRef, STAGE.width)
  const pixelRatio = scenePixelRatio(window.devicePixelRatio, fit)
  const visible = useInView(stageRef)
  useHideSplineTextProxy()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let live = true
    let instance: Application | undefined
    try {
      const loading = new Application(canvas, { renderMode: 'auto', renderer: 'webgl' })
      instance = loading
      loading.load(url).then(
        () => { if (live) setApp(loading) },
        () => { if (live) onFail() },
      )
    } catch {
      onFail()
    }
    return () => {
      live = false
      setApp(null)
      instance?.dispose()
    }
  }, [url, onFail])

  useEffect(() => {
    if (app) applyPixelRatio(app, pixelRatio)
  }, [app, pixelRatio])

  // nothing to see off screen: stop the render loop (and its events) until the stage scrolls back
  useEffect(() => {
    if (!app) return
    if (visible && app.isStopped) app.play()
    else if (!visible && !app.isStopped) app.stop()
  }, [app, visible])

  return (
    <div ref={stageRef} className={styles.stage} style={{ ...STAGE, '--fit': fit } as CSSProperties}>
      <canvas ref={canvasRef} data-loaded={app !== null} aria-hidden="true" />
    </div>
  )
}
