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
 * the rig moved or something flagged `dirty` (load, resize, pixel ratio). Throws if WebGL is
 * unavailable, so the caller can fall back.
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

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(now - last, MAX_DT) || 1000 / 60
    last = now
    const moved = rig.update(dt)
    if (!moved && !dirty) return
    dirty = false
    gl.render(scene, camera)
    css.render(cssScene, camera)
    if (!announced && desk) {
      announced = true
      onFirstFrame?.()
    }
  }

  const stop = () => {
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
    },
    start() {
      if (raf || disposed) return
      last = performance.now()
      dirty = true
      raf = requestAnimationFrame(frame)
    },
    stop,
    resize(width, height) {
      size = { width, height }
      gl.setSize(width, height, false) // the canvas is sized by CSS
      css.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      rig.setAspect(height / width)
      dirty = true
    },
    setPixelRatio(ratio) {
      gl.setPixelRatio(ratio)
      gl.setSize(size.width, size.height, false) // three applies the ratio on setSize
      dirty = true
    },
    setPointer(pointer) {
      rig.setPointer(pointer)
    },
    setReduceMotion(on) {
      rig.setReduceMotion(on)
    },
    goTo(key) {
      rig.goTo(key)
    },
    dispose() {
      disposed = true
      stop()
      desk?.dispose()
      screen.dispose()
      gl.dispose()
      css.domElement.remove()
      gl.domElement.remove()
    },
  }
}
