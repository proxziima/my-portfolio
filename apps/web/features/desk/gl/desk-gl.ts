import { DoubleSide, Group, MathUtils, Mesh, MeshBasicMaterial, NoBlending, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer, type Object3D } from 'three'
import { loadDesk, type DeskAssetUrls, type LoadedDesk } from '../assets'
import { SCREEN, type Vec3 } from '../config'
import type { GlFrameCamera } from './host'

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

const place = (object: Object3D, spec: PlaneSpec) => {
  object.position.set(spec.position.x, spec.position.y, spec.position.z)
  object.rotation.set(spec.rotation.x, spec.rotation.y, spec.rotation.z)
}

/**
 * The screen as the GL scene sees it, at the CSS3D screen's transform (`createMonitorScreen`): an
 * occluder plane that writes transparent pixels with `NoBlending`, so the models in front of the
 * glass cover the iframe and the glass itself shows the DOM beneath the canvas, and four bezels.
 */
export function createScreenGl(screen: ScreenSpec = SCREEN): { group: Group; dispose(): void } {
  const group = new Group()
  group.position.set(screen.position.x, screen.position.y, screen.position.z)
  group.rotation.set(MathUtils.degToRad(screen.tiltDeg), 0, 0)

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
    group.add(mesh)
  }
  add(occluder, occluderMaterial)
  for (const bezel of bezels) add(bezel, bezelMaterial)

  return {
    group,
    dispose() {
      for (const g of geometries) g.dispose()
      occluderMaterial.dispose()
      bezelMaterial.dispose()
    },
  }
}

/** The desk's WebGL side, wherever it runs. */
export interface DeskGl {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  /** Fetches these models into the scene; rejects on any failure. */
  load(assets: DeskAssetUrls): Promise<void>
  /** CSS size and pixel ratio; the canvas's own CSS size is left to its owner. */
  resize(width: number, height: number, pixelRatio: number): void
  /** Draws one frame with exactly this camera. Returns whether the models are in it. */
  render(camera: GlFrameCamera): boolean
  dispose(): void
}

/**
 * The desk's GL scene: the screen's planes and the models, drawn by a camera that is only matrices,
 * so the frame is drawn from the very numbers the CSS3D side uses. No DOM: it runs as well on an
 * OffscreenCanvas in a worker (its globals are `fetch`, `createImageBitmap` and `WebAssembly`).
 * Throws if the canvas gives no WebGL context.
 */
export function createDeskGl(canvas: HTMLCanvasElement | OffscreenCanvas): DeskGl {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  const scene = new Scene()
  const screen = createScreenGl(SCREEN)
  scene.add(screen.group)

  const camera = new PerspectiveCamera()
  camera.matrixAutoUpdate = false
  camera.matrixWorldAutoUpdate = false

  let desk: LoadedDesk | null = null
  let disposed = false

  return {
    canvas,
    async load(assets) {
      const loaded = await loadDesk(assets)
      if (disposed) {
        loaded.dispose()
        return
      }
      desk = loaded
      scene.add(...loaded.objects)
    },
    resize(width, height, pixelRatio) {
      if (pixelRatio !== renderer.getPixelRatio()) renderer.setPixelRatio(pixelRatio)
      renderer.setSize(width, height, false)
    },
    render({ view, projection }) {
      camera.matrixWorld.fromArray(view)
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
      camera.projectionMatrix.fromArray(projection)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
      renderer.render(scene, camera)
      return desk !== null
    },
    dispose() {
      disposed = true
      desk?.dispose()
      screen.dispose()
      renderer.dispose()
      renderer.forceContextLoss() // free the context now, not at GC: StrictMode and HMR churn through them
    },
  }
}
