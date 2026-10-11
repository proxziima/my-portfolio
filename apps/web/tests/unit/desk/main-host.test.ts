// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const desk = vi.hoisted(() => ({
  created: [] as Array<{ canvas: unknown; assets: unknown }>,
  models: false,
  fail: false,
  log: [] as string[],
  instance: undefined as unknown as { load: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> },
}))

vi.mock('@/features/desk/gl/desk-gl', () => ({
  createDeskGl: (canvas: unknown, assets: unknown) => {
    if (desk.fail) throw new Error('Error creating WebGL context.')
    desk.created.push({ canvas, assets })
    desk.instance = {
      load: vi.fn(async () => {}),
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

const URLS = Promise.resolve([{ model: '/m.glb', texture: '/t.webp' }])
const camera = { view: new Float64Array(16), projection: new Float64Array(16) }

beforeEach(() => {
  desk.created.length = 0
  desk.log.length = 0
  desk.models = false
  desk.fail = false
})

describe('createMainHost', () => {
  it('is the main host, drawing into its own block canvas', () => {
    const host = createMainHost(URLS)
    expect(host.kind).toBe('main')
    expect(host.canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(host.canvas.style.display).toBe('block')
    expect(desk.created).toEqual([{ canvas: host.canvas, assets: URLS }])
  })

  it('throws when there is no WebGL, so the scene can report it', () => {
    desk.fail = true
    expect(() => createMainHost(URLS)).toThrow()
  })

  it('draws, then commits in the same call with whether the models are in', () => {
    const host = createMainHost(URLS)
    const commit = vi.fn((models: boolean) => desk.log.push(`commit ${models}`))
    expect(host.render(camera, commit)).toBe(true)
    expect(desk.instance.render).toHaveBeenCalledWith(camera)
    desk.models = true
    host.render(camera, commit)
    expect(desk.log).toEqual(['render', 'commit false', 'render', 'commit true'])
  })

  it('forwards load, resize and dispose to the scene', async () => {
    const host = createMainHost(URLS)
    await host.load()
    host.resize(600, 400, 2)
    host.dispose()
    expect(desk.instance.load).toHaveBeenCalledTimes(1)
    expect(desk.instance.resize).toHaveBeenCalledWith(600, 400, 2)
    expect(desk.instance.dispose).toHaveBeenCalledTimes(1)
  })
})
