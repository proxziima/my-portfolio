// @vitest-environment jsdom
import { Matrix4, NoBlending, PerspectiveCamera, type Camera, type Mesh, type MeshBasicMaterial, type Scene } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCREEN } from '@/features/desk/config'
import { GL_CONTEXT_ATTRIBUTES } from '@/features/desk/gl/host'

const gl = vi.hoisted(() => ({
  renderers: [] as Array<{
    options: unknown
    clear: unknown[]
    renders: Array<{ scene: Scene; camera: Camera; view: number[]; inverse: number[]; projection: number[] }>
    pixelRatio: number
    sizes: unknown[][]
    disposed: number
    lost: number
  }>,
  load: undefined as unknown as (assets: unknown) => Promise<unknown>,
  /** What textureFormat() answers in the context the scene runs in. */
  format: 'avif' as 'avif' | 'webp',
  probes: 0,
}))

vi.mock('three', async () => {
  const three = await vi.importActual<typeof import('three')>('three')
  /** jsdom has no WebGL: records what the scene asks of the renderer. */
  class WebGLRenderer {
    state = { options: undefined as unknown, clear: [] as unknown[], renders: [] as (typeof gl.renderers)[number]['renders'], pixelRatio: 1, sizes: [] as unknown[][], disposed: 0, lost: 0 }
    constructor(options: unknown) {
      this.state.options = options
      gl.renderers.push(this.state)
    }
    setClearColor(...args: unknown[]) {
      this.state.clear = args
    }
    getPixelRatio() {
      return this.state.pixelRatio
    }
    setPixelRatio(ratio: number) {
      this.state.pixelRatio = ratio
    }
    setSize(...args: unknown[]) {
      this.state.sizes.push(args)
    }
    render(scene: Scene, camera: Camera) {
      // copies: the camera's matrices as they were at this draw
      this.state.renders.push({ scene, camera, view: [...camera.matrixWorld.elements], inverse: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] })
    }
    dispose() {
      this.state.disposed++
    }
    forceContextLoss() {
      this.state.lost++
    }
  }
  return { ...three, WebGLRenderer }
})

vi.mock('@/features/desk/assets', () => ({ loadDesk: (assets: unknown) => gl.load(assets) }))
vi.mock('@/lib/assets/texture-format', () => ({
  textureFormat: async () => {
    gl.probes++
    return gl.format
  },
}))

const { createDeskGl, createScreenGl, screenPlanes } = await import('@/features/desk/gl/desk-gl')
const { createMonitorScreen } = await import('@/features/desk/monitor-screen')
const three = await import('three')

const DESK = [{ model: '/m.glb', texture: { avif: '/t.avif', webp: '/t.webp', width: 2048, height: 2048 } }]

/** A loaded desk: one object, a dispose spy. */
const fakeDesk = () => ({ objects: [new three.Group()], dispose: vi.fn() })

/** A camera somewhere off-axis, looking at the desk, as the rig leaves it. */
function frameCamera() {
  const camera = new PerspectiveCamera(35, 1.6, 10, 900_000)
  camera.position.set(120.123456789, 980.5, 2400.987654321)
  camera.lookAt(0, 950, 255)
  camera.updateMatrixWorld()
  return { view: Float64Array.from(camera.matrixWorld.elements), projection: Float64Array.from(camera.projectionMatrix.elements), camera }
}

describe('screenPlanes', () => {
  const { occluder, bezels } = screenPlanes(SCREEN)

  it('puts the occluder at the screen, screen-sized', () => {
    expect(occluder).toEqual({ width: SCREEN.width, height: SCREEN.height, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } })
  })

  it('encloses the screen with four bezels standing `depth` deep in front of it', () => {
    expect(bezels).toHaveLength(4)
    const half = SCREEN.depth / 2
    for (const b of bezels) expect(b.position.z).toBe(half)
    const xs = bezels.map((b) => b.position.x).sort((a, b) => a - b)
    const ys = bezels.map((b) => b.position.y).sort((a, b) => a - b)
    expect(xs).toEqual([-SCREEN.width / 2, 0, 0, SCREEN.width / 2])
    expect(ys).toEqual([-SCREEN.height / 2, 0, 0, SCREEN.height / 2])
  })

  it('turns the side bezels about y and the top/bottom about x', () => {
    const sides = bezels.filter((b) => b.position.x !== 0)
    const caps = bezels.filter((b) => b.position.y !== 0)
    for (const s of sides) expect(s).toMatchObject({ width: SCREEN.depth, height: SCREEN.height, rotation: { x: 0, y: Math.PI / 2, z: 0 } })
    for (const c of caps) expect(c).toMatchObject({ width: SCREEN.width, height: SCREEN.depth, rotation: { x: Math.PI / 2, y: 0, z: 0 } })
  })
})

describe('createScreenGl', () => {
  it('stands exactly where the CSS3D screen stands, so the occluder covers the iframe', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const screen = createMonitorScreen('/os')
    const { group, dispose } = createScreenGl(SCREEN)
    expect(group.position.toArray()).toEqual(screen.css.position.toArray())
    expect(group.rotation.toArray()).toEqual(screen.css.rotation.toArray())
    dispose()
    screen.dispose()
    vi.restoreAllMocks()
  })

  it('holds a black, fully transparent, unblended occluder and four bezels', () => {
    const { group, dispose } = createScreenGl(SCREEN)
    const [occluder, ...bezels] = group.children as Mesh[]
    const material = occluder!.material as MeshBasicMaterial
    expect(material.color.getHex()).toBe(0x000000)
    expect(material).toMatchObject({ transparent: true, opacity: 0, blending: NoBlending })
    expect(bezels).toHaveLength(4)
    for (const b of bezels) expect((b.material as MeshBasicMaterial).color.getHex()).toBe(0x48493f)
    const freed = vi.fn()
    material.addEventListener('dispose', freed)
    occluder!.geometry.addEventListener('dispose', freed)
    dispose()
    expect(freed).toHaveBeenCalledTimes(2)
  })
})

describe('createDeskGl', () => {
  /** jsdom has no WebGL2: a stand-in context, or none (`null`) for a browser without it. */
  let context: object | null
  const canvas = () => {
    const c = document.createElement('canvas')
    vi.spyOn(c, 'getContext').mockImplementation(() => context as RenderingContext)
    return c
  }

  beforeEach(() => {
    gl.renderers.length = 0
    gl.load = async () => fakeDesk()
    gl.format = 'avif'
    gl.probes = 0
    context = { webgl2: true }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('draws into the canvas it is given, transparent and antialiased', () => {
    const c = canvas()
    const desk = createDeskGl(c)
    expect(desk.canvas).toBe(c)
    // the context made with the shared attributes (the main host may have made it first: the same one)
    expect(c.getContext).toHaveBeenCalledWith('webgl2', GL_CONTEXT_ATTRIBUTES)
    expect(gl.renderers[0]!.options).toEqual({ canvas: c, context, alpha: true, antialias: true, powerPreference: 'high-performance' })
    expect(gl.renderers[0]!.clear).toEqual([0x000000, 0])
  })

  it('renders with a camera that is exactly the frame camera: same view, its inverse, same projection', () => {
    const desk = createDeskGl(canvas())
    const { view, projection, camera } = frameCamera()
    desk.render({ view, projection })
    const drawn = gl.renderers[0]!.renders[0]!
    expect(drawn.view).toEqual([...camera.matrixWorld.elements])
    expect(drawn.inverse).toEqual([...camera.matrixWorldInverse.elements])
    expect(drawn.projection).toEqual([...camera.projectionMatrix.elements])
    expect(drawn.camera.projectionMatrixInverse.elements).toEqual(new Matrix4().copy(camera.projectionMatrix).invert().elements)
    // the renderer must not recompute them from position/rotation it never got
    expect(drawn.camera.matrixAutoUpdate).toBe(false)
    expect(drawn.camera.matrixWorldAutoUpdate).toBe(false)
  })

  it('says the models are in the frame only once they have loaded', async () => {
    const loaded = fakeDesk()
    gl.load = async () => loaded
    const desk = createDeskGl(canvas())
    const { view, projection } = frameCamera()
    expect(desk.render({ view, projection })).toBe(false)
    await desk.load(DESK)
    expect(desk.render({ view, projection })).toBe(true)
    const scene = gl.renderers[0]!.renders[1]!.scene
    // the screen first, then the models, as the scene was always built
    expect(scene.children).toHaveLength(2)
    expect(scene.children[1]).toBe(loaded.objects[0])
  })

  it('throws without a WebGL2 context, so a worker answers unsupported and the main host is not used', () => {
    context = null
    expect(() => createDeskGl(canvas())).toThrow()
    expect(gl.renderers).toHaveLength(0)
  })

  it('probes the texture format where it runs, loads that encode and resolves with it', async () => {
    const seen: unknown[] = []
    gl.load = async (assets) => {
      seen.push(assets)
      return fakeDesk()
    }
    await expect(createDeskGl(canvas()).load(DESK)).resolves.toBe('avif')
    gl.format = 'webp'
    await expect(createDeskGl(canvas()).load(DESK)).resolves.toBe('webp')
    expect(gl.probes).toBe(2)
    expect(seen).toEqual([[{ model: '/m.glb', texture: '/t.avif' }], [{ model: '/m.glb', texture: '/t.webp' }]])
  })

  it('rejects when the models fail', async () => {
    gl.load = async () => {
      throw new Error('404')
    }
    await expect(createDeskGl(canvas()).load(DESK)).rejects.toThrow('404')
  })

  it('sizes the drawing buffer by the pixel ratio and leaves the CSS size alone', () => {
    const desk = createDeskGl(canvas())
    desk.resize(600, 400, 2)
    expect(gl.renderers[0]!.pixelRatio).toBe(2)
    expect(gl.renderers[0]!.sizes.at(-1)).toEqual([600, 400, false])
  })

  it('frees the models and the context on dispose', async () => {
    const loaded = fakeDesk()
    gl.load = async () => loaded
    const desk = createDeskGl(canvas())
    await desk.load(DESK)
    desk.dispose()
    expect(loaded.dispose).toHaveBeenCalledTimes(1)
    expect(gl.renderers[0]!.disposed).toBe(1)
    expect(gl.renderers[0]!.lost).toBe(1)
  })

  it('frees models that arrive after dispose without adding them', async () => {
    const loaded = fakeDesk()
    let arrive: ((d: typeof loaded) => void) | null = null
    gl.load = () => new Promise((r) => (arrive = r))
    const desk = createDeskGl(canvas())
    const loading = desk.load(DESK)
    await vi.waitFor(() => expect(arrive).not.toBeNull())
    desk.dispose()
    arrive!(loaded)
    await loading
    expect(loaded.dispose).toHaveBeenCalledTimes(1)
  })
})
