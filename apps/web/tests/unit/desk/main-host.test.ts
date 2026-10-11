// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GL_CONTEXT_ATTRIBUTES } from '@/features/desk/gl/host'

const desk = vi.hoisted(() => ({
  created: [] as Array<{ canvas: unknown }>,
  models: false,
  log: [] as string[],
  instance: undefined as unknown as { load: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> },
}))

vi.mock('@/features/desk/gl/desk-gl', () => ({
  createDeskGl: (canvas: unknown) => {
    desk.created.push({ canvas })
    desk.instance = {
      load: vi.fn(async () => 'avif'),
      resize: vi.fn(),
      render: vi.fn(() => {
        desk.log.push('render')
        return desk.models
      }),
      dispose: vi.fn(),
    }
    return { canvas, ...desk.instance }
  },
}))

const { createMainHost } = await import('@/features/desk/gl/main-host')

const LIST = [{ model: '/m.glb', texture: { webp: '/t.webp', width: 2048, height: 2048 } }]
const camera = { view: new Float64Array(16), projection: new Float64Array(16) }
/** The WebGL2 context jsdom does not have; `null` plays a browser without one. */
let context: { getExtension: ReturnType<typeof vi.fn>; loseContext: ReturnType<typeof vi.fn> } | null
let getContext: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  desk.created.length = 0
  desk.log.length = 0
  desk.models = false
  const loseContext = vi.fn()
  context = { loseContext, getExtension: vi.fn(() => ({ loseContext })) }
  getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as unknown as RenderingContext)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The scene's code has arrived (the dynamic import resolved). */
const sceneIn = () => vi.waitFor(() => expect(desk.created).toHaveLength(1))

describe('createMainHost', () => {
  it('is the main host, drawing into its own block canvas', async () => {
    const host = createMainHost(LIST)
    expect(host.kind).toBe('main')
    expect(host.canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(host.canvas.style.display).toBe('block')
    await sceneIn()
    expect(desk.created).toEqual([{ canvas: host.canvas }])
  })

  it('creates the context at once with the scene attributes, and throws without WebGL, so the scene can report it', () => {
    createMainHost(LIST)
    expect(getContext).toHaveBeenCalledWith('webgl2', GL_CONTEXT_ATTRIBUTES)
    context = null
    expect(() => createMainHost(LIST)).toThrow()
  })

  it('skips frames until the scene code is in, so the caller keeps what it shows', async () => {
    const host = createMainHost(LIST)
    const commit = vi.fn()
    expect(host.render(camera, commit)).toBe(false)
    expect(commit).not.toHaveBeenCalled()
    await sceneIn()
    expect(host.render(camera, commit)).toBe(true)
  })

  it('draws, then commits in the same call with whether the models are in', async () => {
    const host = createMainHost(LIST)
    await sceneIn()
    const commit = vi.fn((models: boolean) => desk.log.push(`commit ${models}`))
    expect(host.render(camera, commit)).toBe(true)
    expect(desk.instance.render).toHaveBeenCalledWith(camera)
    desk.models = true
    host.render(camera, commit)
    expect(desk.log).toEqual(['render', 'commit false', 'render', 'commit true'])
  })

  it('loads through the scene once its code is in, resolving with the format it decoded', async () => {
    const host = createMainHost(LIST)
    await expect(host.load()).resolves.toBe('avif')
    expect(desk.instance.load).toHaveBeenCalledWith(LIST)
  })

  it('applies a resize asked for before the scene code arrived, and forwards later ones', async () => {
    const host = createMainHost(LIST)
    host.resize(600, 400, 2)
    await sceneIn()
    expect(desk.instance.resize).toHaveBeenCalledWith(600, 400, 2)
    host.resize(300, 200, 1)
    expect(desk.instance.resize).toHaveBeenLastCalledWith(300, 200, 1)
  })

  it('disposes the scene, or frees the bare context if disposed before the scene came', async () => {
    const early = createMainHost(LIST)
    const earlyContext = context!
    early.dispose()
    expect(earlyContext.loseContext).toHaveBeenCalled()
    // the early host never builds its scene, even once the code is in
    await new Promise((r) => setTimeout(r, 10))
    expect(desk.created).toEqual([])
    const host = createMainHost(LIST)
    await sceneIn()
    host.dispose()
    expect(desk.instance.dispose).toHaveBeenCalledTimes(1)
  })

  it('reports a lost context, but not the one its own dispose causes', async () => {
    const host = createMainHost(LIST)
    await sceneIn()
    const onFail = vi.fn()
    host.onFail(onFail)
    host.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(onFail).toHaveBeenCalledWith('context_lost')
    onFail.mockClear()
    host.dispose()
    host.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(onFail).not.toHaveBeenCalled()
  })
})
