import { DoubleSide, Group, MathUtils, Mesh, MeshBasicMaterial, NoBlending, PlaneGeometry, type Object3D } from 'three'
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { ASSETS, type ImageAsset, type VideoAsset } from '@/lib/assets/manifest'
import { fallbackSrc, srcset } from '@/lib/assets/srcset'
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
  /** The screen slab: powered off it is the dark tube and the tab stop; powered on it holds the OS. */
  element: HTMLDivElement
  /** The OS's iframe, once powered on. */
  readonly iframe: HTMLIFrameElement | null
  /** Boots the OS: appends its iframe under the CRT layers. Idempotent; returns the iframe. */
  powerOn(): HTMLIFrameElement
  /** `cb` runs once, when the OS's first document has loaded. Returns the unsubscribe. */
  onLoaded(cb: () => void): () => void
  /** Add to the CSS scene. */
  css: CSS3DObject
  /** Add to the GL scene. */
  gl: Object3D
  /** Plays the static videos once they have sources; a no-op under reduced motion. */
  play(): void
  /** Pauses the static videos, so they decode only while the scene is on screen. */
  pause(): void
  dispose(): void
}

/** The OS's desktop root; absent while it shows the boot or shutdown console. */
const DESKTOP_SELECTOR = '[data-anchor="desktop"]'
/** If the desktop has not shown by then (a changed OS, a slow CMS), the layers come on anyway. */
const DESKTOP_TIMEOUT_MS = 20_000

/**
 * Shows the CRT layers only while the OS shows its desktop: the boot and shutdown screens are black
 * consoles; the CRT layers over them read as a broken texture. Watches the iframe's document (same
 * origin) on every load; where it cannot be read, or the desktop never appears, the layers come on
 * so they are never lost. `onFirstReady` runs the first time they come on. Returns the cleanup.
 */
function gateOnDesktop(iframe: HTMLIFrameElement, fx: HTMLElement, onFirstReady: () => void): () => void {
  let observer: MutationObserver | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let shown = false
  // every mutation in the OS lands here: write only on a change
  const set = (ready: boolean) => {
    const value = String(ready)
    if (fx.dataset.ready !== value) fx.dataset.ready = value
    if (ready && !shown) {
      shown = true
      onFirstReady()
    }
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

/** Every still layer spans the fixed 1280 px screen; CSS3D only transforms it, so this is its layout width. */
const LAYER_SIZES = `${SCREEN.width}px`

/**
 * A still layer as `<picture>`: AVIF, else the `<img>`'s own candidates, picked by density for the
 * screen's layout width. Decorative, never dragged or announced. The `<img>` joins the `<picture>`
 * before it gets a source, so the AVIF `<source>` takes part in the first (and only) pick.
 */
function layerPicture(className: string, asset: ImageAsset): HTMLPictureElement {
  const picture = document.createElement('picture')
  const avif = srcset(asset, 'avif')
  if (avif) {
    const source = document.createElement('source')
    source.type = 'image/avif'
    source.srcset = avif
    source.sizes = LAYER_SIZES
    picture.append(source)
  }
  const img = document.createElement('img')
  picture.append(img)
  img.className = className
  img.alt = ''
  img.decoding = 'async'
  img.draggable = false
  img.width = asset.width
  img.height = asset.height
  img.sizes = LAYER_SIZES
  img.srcset = srcset(asset, 'fallback')
  img.src = fallbackSrc(asset)
  return picture
}

/**
 * A looping static layer with no sources yet: nothing downloads until the layers can be seen
 * (`attachSources`). Not autoplay, so `play`/`pause` decide when it decodes.
 */
function layerVideo(className: string): HTMLVideoElement {
  const video = document.createElement('video')
  video.className = className
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'none'
  video.autoplay = false
  video.disablePictureInPicture = true
  video.setAttribute('aria-hidden', 'true')
  return video
}

/** The pipeline's encodes in its order (AV1, then VP9, then H.264): the first the browser can play wins. */
function attachSources(video: HTMLVideoElement, asset: VideoAsset): void {
  if (video.childElementCount) return
  for (const s of asset.sources) {
    const source = document.createElement('source')
    source.src = s.src
    source.type = s.type
    video.append(source)
  }
  video.preload = 'auto'
  video.load()
}

/** Each static layer and its encodes, in the reference's stacking order. */
const LAYERS: ReadonlyArray<{ className: string; asset: VideoAsset }> = [
  { className: 'screen-static', asset: ASSETS.desk.screen.staticBase },
  { className: 'screen-static screen-static--fine', asset: ASSETS.desk.screen.staticLayer },
]

/** The powered-off screen's accessible name; the OS's iframe takes over as "Desktop" once it loads. */
const POWERED_OFF_LABEL = 'Desktop (powered off)'

/**
 * The DOM the CSS3D object carries: a fixed-size slab shaded like a powered-off tube and, over it,
 * the reference's CRT layers in its stacking order (inner shadow, two static videos, smudges; blended
 * in `screen-fx.css`), which let the pointer through and fade in only while the OS shows its desktop.
 * Powered off, the slab is the screen's tab stop, announced as a picture. The OS's iframe joins it
 * only on power-on (`createOsFrame`).
 */
function createScreenElement(screen: ScreenSpec): { element: HTMLDivElement; fx: HTMLDivElement; videos: HTMLVideoElement[] } {
  const element = document.createElement('div')
  Object.assign(element.style, {
    width: `${screen.width}px`,
    height: `${screen.height}px`,
    background: 'radial-gradient(ellipse at center, #243436 0%, #121a1b 70%, #0b0f10 100%)',
  })
  element.tabIndex = 0
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', POWERED_OFF_LABEL)
  const fx = document.createElement('div')
  fx.className = 'screen-fx'
  fx.setAttribute('aria-hidden', 'true')
  fx.style.pointerEvents = 'none' // inline too: the iframe must stay clickable even before the stylesheet applies
  fx.dataset.ready = 'false'
  const videos = LAYERS.map((l) => layerVideo(l.className))
  fx.append(layerPicture('screen-shadow', ASSETS.desk.screen.shadow), ...videos, layerPicture('screen-smudges', ASSETS.desk.screen.smudges))
  element.append(fx)
  return { element, fx, videos }
}

/** The OS's iframe, inset by `padding` in the slab. */
function createOsFrame(src: string, screen: ScreenSpec): HTMLIFrameElement {
  const iframe = document.createElement('iframe')
  iframe.src = src
  iframe.title = 'Desktop'
  iframe.className = 'screen-jitter'
  Object.assign(iframe.style, { display: 'block', width: '100%', height: '100%', border: '0', padding: `${screen.padding}px`, boxSizing: 'border-box' })
  return iframe
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const place = (object: Object3D, spec: PlaneSpec) => {
  object.position.set(spec.position.x, spec.position.y, spec.position.z)
  object.rotation.set(spec.rotation.x, spec.rotation.y, spec.rotation.z)
}

/**
 * The screen as the camera sees it: a CSS3D object holding the slab (and, once powered on, the OS's
 * iframe), and a GL group at the same transform whose occluder plane writes transparent pixels with
 * `NoBlending`, so the models in front of the glass cover the iframe and the glass itself shows the
 * DOM beneath the canvas. It starts powered off, a dark tube, and boots the OS on `powerOn`.
 */
export function createMonitorScreen(src: string, screen: ScreenSpec = SCREEN): MonitorScreen {
  /** Whether the figure wants the static running (`play` since the last `pause`). */
  let wantPlay = false
  /** Whether the layers have come on once: before that the videos have no sources. */
  let shown = false
  const attachAll = () => videos.forEach((v, i) => attachSources(v, LAYERS[i]!.asset))
  const start = () => {
    // the videos are hidden under reduced motion (screen-fx.css): do not fetch or decode them either
    if (!wantPlay || !shown || prefersReducedMotion()) return
    attachAll()
    // a rejected play (autoplay policy, a pause racing it) leaves the static still, nothing worse
    for (const v of videos) v.play().catch(() => {})
  }
  const { element, fx, videos } = createScreenElement(screen)
  let iframe: HTMLIFrameElement | null = null
  let stopGate = () => {}
  let loaded = false
  const loadedCallbacks = new Set<() => void>()
  const onFirstReady = () => {
    shown = true
    if (!prefersReducedMotion()) attachAll()
    start()
  }
  /** The OS's first document is in: the iframe becomes the tab stop, and keyboard focus follows it there. */
  const handOver = (frame: HTMLIFrameElement) => {
    const hadFocus = document.activeElement === element
    element.tabIndex = -1
    element.removeAttribute('role')
    element.removeAttribute('aria-label')
    if (hadFocus) frame.focus()
    loaded = true
    for (const cb of [...loadedCallbacks]) cb()
    loadedCallbacks.clear()
  }
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
    element,
    get iframe() {
      return iframe
    },
    powerOn() {
      if (iframe) return iframe
      const frame = createOsFrame(src, screen)
      iframe = frame
      // the gate keeps its own load listener, for the OS's later reloads
      stopGate = gateOnDesktop(frame, fx, onFirstReady)
      frame.addEventListener('load', () => handOver(frame), { once: true })
      element.insertBefore(frame, fx)
      return frame
    },
    onLoaded(cb) {
      if (loaded) {
        cb()
        return () => {}
      }
      loadedCallbacks.add(cb)
      return () => loadedCallbacks.delete(cb)
    },
    css,
    gl,
    play() {
      wantPlay = true
      start()
    },
    pause() {
      wantPlay = false
      for (const v of videos) v.pause()
    },
    dispose() {
      wantPlay = false
      // pausing alone keeps the decoder: drop the sources and reload to release it now
      for (const v of videos) {
        v.pause()
        v.replaceChildren()
        v.load()
      }
      for (const g of geometries) g.dispose()
      occluderMaterial.dispose()
      bezelMaterial.dispose()
      stopGate()
      loadedCallbacks.clear()
      element.remove()
    },
  }
}
