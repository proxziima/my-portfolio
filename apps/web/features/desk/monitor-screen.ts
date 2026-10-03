import { DoubleSide, Group, MathUtils, Mesh, MeshBasicMaterial, NoBlending, PlaneGeometry, type Object3D } from 'three'
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { SCREEN, type Vec3 } from './config'

type ScreenSpec = typeof SCREEN

export interface PlaneSpec {
  width: number
  height: number
  /** In the screen's local frame: origin at the screen centre, +z toward the viewer. */
  position: Vec3
  /** Euler radians. */
  rotation: Vec3
}

const BEZEL_COLOR = 0x48493f

/** The GL side of the screen, in its local frame: the occluder at the glass, four bezels around it. Pure. */
export function screenPlanes(screen: ScreenSpec): { occluder: PlaneSpec; bezels: PlaneSpec[] } {
  const { width, height, depth } = screen
  const z = depth / 2
  const sideRot = { x: 0, y: Math.PI / 2, z: 0 }
  const capRot = { x: Math.PI / 2, y: 0, z: 0 }
  return {
    occluder: { width, height, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    bezels: [
      { width: depth, height, position: { x: -width / 2, y: 0, z }, rotation: sideRot },
      { width: depth, height, position: { x: width / 2, y: 0, z }, rotation: sideRot },
      { width, height: depth, position: { x: 0, y: height / 2, z }, rotation: capRot },
      { width, height: depth, position: { x: 0, y: -height / 2, z }, rotation: capRot },
    ],
  }
}

export interface MonitorScreen {
  iframe: HTMLIFrameElement
  /** Add to the CSS scene. */
  css: CSS3DObject
  /** Add to the GL scene. */
  gl: Object3D
  /** Plays the static videos; a no-op under reduced motion. */
  play(): void
  /** Pauses the static videos, so they decode only while the scene is on screen. */
  pause(): void
  dispose(): void
}

/** The reference's screen layers (`MonitorScreen.createTextureLayers`), served from `public/`. */
const LAYER_DIR = '/desk/screen'

/** The OS's desktop root; absent while it shows the boot or shutdown console. */
const DESKTOP_SELECTOR = '[data-anchor="desktop"]'
/** If the desktop has not shown by then (a changed OS, a slow CMS), the layers come on anyway. */
const DESKTOP_TIMEOUT_MS = 20_000

/**
 * Shows the CRT layers only while the OS shows its desktop: the boot and shutdown screens are black
 * consoles; the CRT layers over them read as a broken texture. Watches the iframe's document (same
 * origin) on every load; where it cannot be read, or the desktop never appears, the layers come on
 * so they are never lost. Returns the cleanup.
 */
function gateOnDesktop(iframe: HTMLIFrameElement, fx: HTMLElement): () => void {
  let observer: MutationObserver | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  // every mutation in the OS lands here: write only on a change
  const set = (ready: boolean) => {
    const value = String(ready)
    if (fx.dataset.ready !== value) fx.dataset.ready = value
  }
  const stop = () => {
    observer?.disconnect()
    observer = null
    clearTimeout(timer)
  }
  const onLoad = () => {
    stop()
    let doc: Document | null = null
    try {
      doc = iframe.contentDocument
    } catch {
      doc = null
    }
    const body = doc?.body
    if (!body) {
      set(true)
      return
    }
    let seen = false
    const check = () => {
      const on = body.querySelector(DESKTOP_SELECTOR) !== null
      if (on && !seen) {
        seen = true
        clearTimeout(timer)
      }
      set(on)
    }
    timer = setTimeout(() => {
      if (seen) return
      stop()
      set(true)
    }, DESKTOP_TIMEOUT_MS)
    // keeps watching after the first hit: shutdown → boot takes the desktop away again
    observer = new MutationObserver(check)
    observer.observe(body, { childList: true, subtree: true })
    check()
  }
  iframe.addEventListener('load', onLoad)
  return () => {
    iframe.removeEventListener('load', onLoad)
    stop()
  }
}

/** A still layer: decorative, never dragged or announced. */
function layerImage(className: string, file: string): HTMLImageElement {
  const img = document.createElement('img')
  img.className = className
  img.src = `${LAYER_DIR}/${file}`
  img.alt = ''
  img.decoding = 'async'
  img.draggable = false
  return img
}

/** A looping static layer; not autoplay, so `play`/`pause` decide when it decodes. */
function layerVideo(className: string, file: string): HTMLVideoElement {
  const video = document.createElement('video')
  video.className = className
  video.src = `${LAYER_DIR}/${file}`
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'metadata'
  video.autoplay = false
  video.disablePictureInPicture = true
  video.setAttribute('aria-hidden', 'true')
  return video
}

/**
 * The DOM the CSS3D object carries: a fixed-size slab shaded like a powered-off tube, the iframe
 * inset by `padding`, and over both the reference's CRT layers in its stacking order (inner shadow,
 * two static videos, smudges; blended in `screen-fx.css`), which let the pointer through to the
 * iframe and fade in only while the OS shows its desktop (`gateOnDesktop`).
 */
function createScreenElement(src: string, screen: ScreenSpec): {
  element: HTMLDivElement
  iframe: HTMLIFrameElement
  videos: HTMLVideoElement[]
  stopGate: () => void
} {
  const element = document.createElement('div')
  Object.assign(element.style, {
    width: `${screen.width}px`,
    height: `${screen.height}px`,
    background: 'radial-gradient(ellipse at center, #243436 0%, #121a1b 70%, #0b0f10 100%)',
  })
  const iframe = document.createElement('iframe')
  iframe.src = src
  iframe.title = 'Desktop'
  iframe.className = 'screen-jitter'
  Object.assign(iframe.style, { display: 'block', width: '100%', height: '100%', border: '0', padding: `${screen.padding}px`, boxSizing: 'border-box' })
  const fx = document.createElement('div')
  fx.className = 'screen-fx'
  fx.setAttribute('aria-hidden', 'true')
  fx.style.pointerEvents = 'none' // inline too: the iframe must stay clickable even before the stylesheet applies
  fx.dataset.ready = 'false'
  const videos = [
    layerVideo('screen-static', 'static-base.mp4'),
    layerVideo('screen-static screen-static--fine', 'static-layer.mp4'),
  ]
  fx.append(layerImage('screen-shadow', 'shadow.png'), ...videos, layerImage('screen-smudges', 'smudges.jpg'))
  const stopGate = gateOnDesktop(iframe, fx)
  element.append(iframe, fx)
  return { element, iframe, videos, stopGate }
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const place = (object: Object3D, spec: PlaneSpec) => {
  object.position.set(spec.position.x, spec.position.y, spec.position.z)
  object.rotation.set(spec.rotation.x, spec.rotation.y, spec.rotation.z)
}

/**
 * The screen as the camera sees it: a CSS3D object holding the iframe, and a GL group at the same
 * transform whose occluder plane writes transparent pixels with `NoBlending`, so the models in front
 * of the glass cover the iframe and the glass itself shows the DOM beneath the canvas.
 */
export function createMonitorScreen(src: string, screen: ScreenSpec = SCREEN): MonitorScreen {
  const { element, iframe, videos, stopGate } = createScreenElement(src, screen)
  const tilt = MathUtils.degToRad(screen.tiltDeg)

  const css = new CSS3DObject(element)
  css.position.set(screen.position.x, screen.position.y, screen.position.z)
  css.rotation.set(tilt, 0, 0)

  const gl = new Group()
  gl.position.copy(css.position)
  gl.rotation.copy(css.rotation)

  const { occluder, bezels } = screenPlanes(screen)
  // black with alpha 0: the canvas is premultiplied, so any brighter colour at alpha 0 composites as light instead of a hole
  const occluderMaterial = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: NoBlending, side: DoubleSide })
  const bezelMaterial = new MeshBasicMaterial({ color: BEZEL_COLOR, side: DoubleSide })
  const geometries: PlaneGeometry[] = []
  const add = (spec: PlaneSpec, material: MeshBasicMaterial) => {
    const geometry = new PlaneGeometry(spec.width, spec.height)
    geometries.push(geometry)
    const mesh = new Mesh(geometry, material)
    place(mesh, spec)
    gl.add(mesh)
  }
  add(occluder, occluderMaterial)
  for (const bezel of bezels) add(bezel, bezelMaterial)

  return {
    iframe,
    css,
    gl,
    play() {
      // the videos are hidden under reduced motion (screen-fx.css): do not decode them either
      if (prefersReducedMotion()) return
      // a rejected play (autoplay policy, a pause racing it) leaves the static still, nothing worse
      for (const v of videos) v.play().catch(() => {})
    },
    pause() {
      for (const v of videos) v.pause()
    },
    dispose() {
      // pausing alone keeps the decoder: drop the source and reload to release it now
      for (const v of videos) {
        v.pause()
        v.removeAttribute('src')
        v.load()
      }
      for (const g of geometries) g.dispose()
      occluderMaterial.dispose()
      bezelMaterial.dispose()
      stopGate()
      element.remove()
    },
  }
}
