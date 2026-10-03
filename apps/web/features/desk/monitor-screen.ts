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
  dispose(): void
}

/**
 * The DOM the CSS3D object carries: a fixed-size slab shaded like a powered-off tube, the iframe
 * inset by `padding`, and over both the CRT layers (`screen-fx.css`), which let the pointer through
 * to the iframe. The layers wait for the iframe's load: over the bare slab they read as a broken texture.
 */
function createScreenElement(src: string, screen: ScreenSpec): { element: HTMLDivElement; iframe: HTMLIFrameElement } {
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
  iframe.addEventListener('load', () => { fx.dataset.ready = 'true' }, { once: true })
  element.append(iframe, fx)
  return { element, iframe }
}

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
  const { element, iframe } = createScreenElement(src, screen)
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
    dispose() {
      for (const g of geometries) g.dispose()
      occluderMaterial.dispose()
      bezelMaterial.dispose()
      element.remove()
    },
  }
}
