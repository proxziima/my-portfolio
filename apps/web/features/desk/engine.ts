import { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import { loadDesk, type LoadedDesk } from './assets'
import { CameraRig, type CameraKey } from './camera-rig'
import { CAMERA, DESK_ASSETS } from './config'
import type { Pointer } from './keyframes'
import { createMonitorScreen } from './monitor-screen'

export interface DeskEngineOptions {
  /** Positioned box the two renderer layers fill. */
  host: HTMLElement
  /** The OS page the screen shows. */
  screenSrc: string
  reduceMotion?: boolean
  /** The first frame drawn with the models in place. */
  onFirstFrame?: () => void
}

export interface DeskEngine {
  readonly iframe: HTMLIFrameElement
  /** Fetches the models; rejects on any failure. The screen renders before this resolves. */
  load(): Promise<void>
  start(): void
  stop(): void
  resize(width: number, height: number): void
  setPixelRatio(ratio: number): void
  setPointer(pointer: Pointer): void
  setReduceMotion(on: boolean): void
  goTo(key: CameraKey): void
  dispose(): void
}

/** A frame longer than this (a background tab) is clamped so the rig does not leap. */
const MAX_DT = 100

/**
 * One WebGL and one CSS3D renderer sharing a camera. Render on demand: a frame is drawn only when
 * the rig moved or something flagged `dirty` (load, resize, pixel ratio), and once the rig has
 * settled the loop parks until an input wakes it. Throws if WebGL is unavailable, so the caller
 * can fall back.
 */
export function createDeskEngine({ host, screenSrc, reduceMotion = false, onFirstFrame }: DeskEngineOptions): DeskEngine {
  const gl = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
  gl.setClearColor(0x000000, 0)
  const css = new CSS3DRenderer()
  // the DOM screen sits below the canvas; the canvas lets the pointer through to it
  Object.assign(css.domElement.style, { position: 'absolute', inset: '0', zIndex: '0' })
  Object.assign(gl.domElement.style, { position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none' })
  host.append(css.domElement, gl.domElement)

  const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
  const scene = new Scene()
  const cssScene = new Scene()
  const screen = createMonitorScreen(screenSrc)
  scene.add(screen.gl)
  cssScene.add(screen.css)
  const rig = new CameraRig(camera, reduceMotion)

  let desk: LoadedDesk | null = null
  let size = { width: 1, height: 1 }
  let raf = 0
  let last = 0
  let dirty = true
  let announced = false
  let disposed = false
  let running = false

  const draw = () => {
    gl.render(scene, camera)
    css.render(cssScene, camera)
    if (!announced && desk) {
      announced = true
      onFirstFrame?.()
    }
  }

  const frame = (now: number) => {
    raf = 0
    const dt = Math.max(0, Math.min(now - last, MAX_DT)) || 1000 / 60
    last = now
    const moved = rig.update(dt)
    if (moved || dirty) {
      dirty = false
      draw()
    }
    // nothing left to animate: park until something changes (wake)
    if (moved || dirty || !rig.settled()) raf = requestAnimationFrame(frame)
  }

  /** (Re)starts the loop if it is running but parked. */
  const wake = () => {
    if (!running || raf || disposed) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  /**
   * Resizing the canvas clears it: repaint now so the next paint is not blank. `dirty` stays set and
   * the loop wakes, so the next frame draws again once the rig has caught up with the new aspect.
   */
  const redraw = () => {
    dirty = true
    if (running) draw()
    wake()
  }

  const stop = () => {
    running = false
    cancelAnimationFrame(raf)
    raf = 0
  }

  return {
    iframe: screen.iframe,
    async load() {
      const loaded = await loadDesk(DESK_ASSETS)
      if (disposed) {
        loaded.dispose()
        return
      }
      desk = loaded
      scene.add(...loaded.objects)
      dirty = true
      wake()
    },
    start() {
      if (disposed) return
      running = true
      dirty = true
      wake()
    },
    stop,
    resize(width, height) {
      if (width === size.width && height === size.height) return
      size = { width, height }
      gl.setSize(width, height, false) // the canvas is sized by CSS
      css.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      rig.setAspect(height / width)
      redraw()
    },
    setPixelRatio(ratio) {
      if (ratio === gl.getPixelRatio()) return
      gl.setPixelRatio(ratio) // three re-applies the size itself
      redraw()
    },
    setPointer(pointer) {
      rig.setPointer(pointer)
      wake()
    },
    setReduceMotion(on) {
      rig.setReduceMotion(on)
      wake()
    },
    goTo(key) {
      rig.goTo(key)
      wake()
    },
    dispose() {
      disposed = true
      stop()
      desk?.dispose()
      screen.dispose()
      gl.dispose()
      gl.forceContextLoss() // free the context now, not at GC: StrictMode and HMR churn through them
      css.domElement.remove()
      gl.domElement.remove()
    },
  }
}
