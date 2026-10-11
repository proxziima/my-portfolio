// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Camera, Scene } from 'three'
import type { GlFrameCamera, GlHost } from '@/features/desk/gl/host'

const css = vi.hoisted(() => ({ renders: [] as Array<{ view: number[]; inverse: number[]; projection: number[] }> }))

vi.mock('three/addons/renderers/CSS3DRenderer.js', async () => {
  const actual = await vi.importActual<typeof import('three/addons/renderers/CSS3DRenderer.js')>('three/addons/renderers/CSS3DRenderer.js')
  // three assigns `render` in the constructor, not on the prototype: wrap the instance's own
  class CSS3DRenderer extends actual.CSS3DRenderer {
    constructor() {
      super()
      const render = this.render.bind(this)
      this.render = (scene: Scene, camera: Camera) => {
        css.renders.push({ view: [...camera.matrixWorld.elements], inverse: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] })
        render(scene, camera)
      }
    }
  }
  return { ...actual, CSS3DRenderer }
})

const { createDeskEngine } = await import('@/features/desk/engine')
const { Matrix4 } = await import('three')

/** A host whose frames land when the test says: `land(models)` commits the oldest pending one. */
function fakeHost(accept = true) {
  const pending: Array<{ camera: GlFrameCamera; commit: (models: boolean) => void }> = []
  let loaded: () => void = () => {}
  const host = {
    kind: 'main' as const,
    canvas: document.createElement('canvas'),
    load: vi.fn(() => new Promise<void>((r) => (loaded = r))),
    resize: vi.fn(),
    render: vi.fn((camera: GlFrameCamera, commit: (models: boolean) => void) => {
      if (!accept) return false
      pending.push({ camera, commit })
      return true
    }),
    onFail: vi.fn(),
    dispose: vi.fn(),
  } satisfies GlHost
  return {
    host,
    pending,
    land: (models: boolean) => pending.shift()!.commit(models),
    finishLoad: () => loaded(),
    accept: (on: boolean) => (accept = on),
  }
}

let frames: FrameRequestCallback[]
let container: HTMLElement

/** Runs the queued animation frame(s) once. */
const tick = (now = 16) => {
  const queued = frames
  frames = []
  for (const f of queued) f(now)
}

beforeEach(() => {
  css.renders.length = 0
  frames = []
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f))
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = []
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createDeskEngine', () => {
  it("stacks the host's canvas over the CSS3D layer, letting the pointer through", () => {
    const { host } = fakeHost()
    const engine = createDeskEngine({ container, host, screenSrc: '/os' })
    const [cssLayer, canvas] = [...container.children] as HTMLElement[]
    expect(canvas).toBe(host.canvas)
    expect(cssLayer!.style.zIndex).toBe('0')
    expect(canvas!.style).toMatchObject({ position: 'absolute', zIndex: '1', pointerEvents: 'none' })
    engine.dispose()
    expect(host.dispose).toHaveBeenCalledTimes(1)
    expect(container.children).toHaveLength(0)
  })

  it('does not move the CSS3D layer until the GL frame for that camera is on the canvas', () => {
    const fake = fakeHost()
    const engine = createDeskEngine({ container, host: fake.host, screenSrc: '/os' })
    engine.resize(600, 400)
    engine.start()
    tick()
    expect(fake.host.render).toHaveBeenCalledTimes(1)
    expect(css.renders).toHaveLength(0)
    fake.land(false)
    expect(css.renders).toHaveLength(1)
    engine.dispose()
  })

  it('moves the CSS3D layer with exactly the camera the GL frame was drawn with', () => {
    const fake = fakeHost()
    const engine = createDeskEngine({ container, host: fake.host, screenSrc: '/os' })
    engine.resize(600, 400)
    engine.start()
    tick()
    const { view, projection } = fake.pending[0]!.camera
    expect(view).toBeInstanceOf(Float64Array)
    expect(view).toHaveLength(16)
    // the main camera moves on before the frame lands; the CSS3D side must not follow it early
    engine.setPointer({ x: 1, y: -1 })
    engine.resize(800, 400)
    fake.land(false)
    const drawn = css.renders.at(-1)!
    expect(drawn.view).toEqual([...view])
    expect(drawn.projection).toEqual([...projection])
    expect(drawn.inverse).toEqual(new Matrix4().fromArray(view).invert().elements)
    engine.dispose()
  })

  it('sizes the CSS3D layer with the frame drawn at that size, not before', () => {
    const fake = fakeHost()
    const engine = createDeskEngine({ container, host: fake.host, screenSrc: '/os' })
    engine.resize(600, 400)
    engine.start()
    tick()
    fake.land(false)
    const layer = container.children[0] as HTMLElement
    expect([layer.style.width, layer.style.height]).toEqual(['600px', '400px'])
    // the resize draws at once; until that frame lands the CSS3D layer stays with the frame on the canvas
    engine.resize(800, 500)
    expect([layer.style.width, layer.style.height]).toEqual(['600px', '400px'])
    fake.land(false)
    expect([layer.style.width, layer.style.height]).toEqual(['800px', '500px'])
    engine.dispose()
  })

  it('reports the first frame with the models once, and the camera distance on every frame', async () => {
    const fake = fakeHost()
    const onFirstFrame = vi.fn()
    const onFrame = vi.fn()
    const engine = createDeskEngine({ container, host: fake.host, screenSrc: '/os', onFirstFrame, onFrame })
    engine.resize(600, 400)
    engine.start()
    tick()
    fake.land(false)
    expect(onFirstFrame).not.toHaveBeenCalled()
    expect(onFrame).toHaveBeenCalledTimes(1)
    const view = fake.host.render.mock.calls[0]![0].view
    expect(onFrame.mock.calls[0]![0]).toBeCloseTo(Math.hypot(view[12]!, view[13]!, view[14]!), 9)
    const loading = engine.load()
    fake.finishLoad()
    await loading
    tick()
    fake.land(true)
    expect(onFirstFrame).toHaveBeenCalledTimes(1)
    engine.resize(700, 400)
    fake.land(true)
    expect(onFirstFrame).toHaveBeenCalledTimes(1)
    expect(onFrame).toHaveBeenCalledTimes(3)
    engine.dispose()
  })

  it('sends the box size and the pixel ratio to the host together', () => {
    const { host } = fakeHost()
    const engine = createDeskEngine({ container, host, screenSrc: '/os' })
    engine.resize(600, 400)
    expect(host.resize).toHaveBeenLastCalledWith(600, 400, 1)
    engine.setPixelRatio(2)
    expect(host.resize).toHaveBeenLastCalledWith(600, 400, 2)
    host.resize.mockClear()
    engine.resize(600, 400)
    engine.setPixelRatio(2)
    expect(host.resize).not.toHaveBeenCalled()
    engine.dispose()
  })

  it('stays dirty and asks again next frame when the host skips one', () => {
    const fake = fakeHost(false)
    const engine = createDeskEngine({ container, host: fake.host, screenSrc: '/os' })
    engine.resize(600, 400)
    engine.start()
    // let the rig settle so only `dirty` can keep the loop going
    for (let i = 0; i < 600 && frames.length; i++) tick(16 * (i + 1))
    expect(frames).toHaveLength(1)
    fake.accept(true)
    tick(16 * 700)
    expect(fake.pending).toHaveLength(1)
    engine.dispose()
  })
})
