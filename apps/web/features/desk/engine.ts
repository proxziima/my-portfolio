import { PerspectiveCamera, Scene, Vector3 } from 'three'
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import { CameraRig, type CameraKey } from './camera-rig'
import { CAMERA } from './config'
import type { GlFrameCamera, GlHost } from './gl/host'
import type { Pointer } from './keyframes'
import { createMonitorScreen } from './monitor-screen'

export interface DeskEngineOptions {
  /** Positioned box the two renderer layers fill. */
  container: HTMLElement
  /** Where the WebGL layer is drawn; the engine owns it from here and disposes it. */
  host: GlHost
  /** The OS page the screen shows. */
  screenSrc: string
  reduceMotion?: boolean
  /** The first frame drawn with the models in place. */
  onFirstFrame?: () => void
  /** Every drawn frame: the camera's distance to the desk origin, for the ambience. */
  onFrame?: (cameraDistance: number) => void
}

/** The monitor's screen as the scene's owner drives it: powered off until `powerOn` (see `MonitorScreen`). */
export interface DeskScreen {
  readonly element: HTMLElement
  readonly iframe: HTMLIFrameElement | null
  powerOn(): void
  onLoaded(cb: () => void): () => void
}

export interface DeskEngine {
  readonly screen: DeskScreen
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
 * The GL layer (a `GlHost`) and one CSS3D renderer sharing a camera. The rig drives the camera; each
 * frame its matrices go to the host, and the CSS3D layer takes the same matrices only when the host
 * commits that frame, so the two layers always show the same pose. Render on demand: a frame is
 * drawn only when the rig moved or something flagged `dirty` (load, resize, pixel ratio, a frame the
 * host skipped), and once the rig has settled the loop parks until an input wakes it.
 */
export function createDeskEngine({
  container,
  host,
  screenSrc,
  reduceMotion = false,
  onFirstFrame,
  onFrame,
}: DeskEngineOptions): DeskEngine {
  const css = new CSS3DRenderer()
  // the DOM screen sits below the canvas; the canvas lets the pointer through to it
  Object.assign(css.domElement.style, { position: 'absolute', inset: '0', zIndex: '0' })
  Object.assign(host.canvas.style, { position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none' })
  container.append(css.domElement, host.canvas)

  const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
  /** The camera CSS3D renders with: only ever the matrices of the frame the host committed. */
  const cssCamera = new PerspectiveCamera()
  cssCamera.matrixAutoUpdate = false
  cssCamera.matrixWorldAutoUpdate = false
  const cssScene = new Scene()
  const screen = createMonitorScreen(screenSrc)
  cssScene.add(screen.css)
  const rig = new CameraRig(camera, reduceMotion)
  const cameraPosition = new Vector3()

  let size = { width: 1, height: 1 }
  let pixelRatio = 1
  let raf = 0
  let last = 0
  let dirty = true
  let announced = false
  let disposed = false
  let running = false

  /** Asks the host for a frame of the camera as it is now; false if the host skipped it. */
  const draw = () => {
    camera.updateMatrixWorld()
    const frame: GlFrameCamera = { view: Float64Array.from(camera.matrixWorld.elements), projection: Float64Array.from(camera.projectionMatrix.elements) }
    return host.render(frame, (models) => {
      cssCamera.matrixWorld.fromArray(frame.view)
      cssCamera.matrixWorldInverse.copy(cssCamera.matrixWorld).invert()
      cssCamera.projectionMatrix.fromArray(frame.projection)
      css.render(cssScene, cssCamera)
      if (!announced && models) {
        announced = true
        onFirstFrame?.()
      }
      onFrame?.(cameraPosition.setFromMatrixPosition(cssCamera.matrixWorld).length())
    })
  }

  const frame = (now: number) => {
    raf = 0
    const dt = Math.max(0, Math.min(now - last, MAX_DT)) || 1000 / 60
    last = now
    const moved = rig.update(dt)
    if (moved || dirty) {
      dirty = false
      if (!draw()) dirty = true
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

  // the screen's static videos follow the loop: they decode only while the figure is on screen
  const stop = () => {
    running = false
    cancelAnimationFrame(raf)
    raf = 0
    screen.pause()
  }

  return {
    screen: {
      element: screen.element,
      get iframe() {
        return screen.iframe
      },
      powerOn: () => void screen.powerOn(),
      onLoaded: (cb) => screen.onLoaded(cb),
    },
    async load() {
      await host.load()
      if (disposed) return
      dirty = true
      wake()
    },
    start() {
      if (disposed) return
      running = true
      dirty = true
      screen.play()
      wake()
    },
    stop,
    resize(width, height) {
      if (width === size.width && height === size.height) return
      size = { width, height }
      host.resize(width, height, pixelRatio) // the canvas is sized by CSS
      css.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      rig.setAspect(height / width)
      redraw()
    },
    setPixelRatio(ratio) {
      if (ratio === pixelRatio) return
      pixelRatio = ratio
      host.resize(size.width, size.height, ratio)
      redraw()
    },
    setPointer(pointer) {
      rig.setPointer(pointer)
      wake()
    },
    setReduceMotion(on) {
      rig.setReduceMotion(on)
      // the preference can flip while the figure is on screen: the hidden static stops decoding too
      if (on) screen.pause()
      else if (running) screen.play()
      wake()
    },
    goTo(key) {
      rig.goTo(key)
      wake()
    },
    dispose() {
      disposed = true
      stop()
      screen.dispose()
      host.dispose()
      css.domElement.remove()
      host.canvas.remove()
    },
  }
}
