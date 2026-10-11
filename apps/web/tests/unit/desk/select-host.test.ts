// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlFailure, GlFrameCamera, HostKind } from '@/features/desk/gl/host'

/** A host stand-in: frames commit when the test lands them (main: at once, as the real one). */
function fakeHost(kind: HostKind) {
  const failed: Array<(r: GlFailure) => void> = []
  let settleLoad: { resolve: () => void; reject: (e: Error) => void } = { resolve: () => {}, reject: () => {} }
  let settleReady: { resolve: () => void; reject: (e: Error) => void } = { resolve: () => {}, reject: () => {} }
  const pending: Array<(models: boolean) => void> = []
  const host = {
    kind,
    canvas: document.createElement('canvas'),
    ready: new Promise<void>((resolve, reject) => (settleReady = { resolve, reject })),
    accepting: kind === 'main',
    /** Whether a main host's frames have the models (they commit synchronously). */
    models: false,
    load: vi.fn(() => new Promise<void>((resolve, reject) => (settleLoad = { resolve, reject }))),
    resize: vi.fn(),
    render: vi.fn((_: GlFrameCamera, commit: (models: boolean) => void) => {
      if (!host.accepting) return false
      if (kind === 'main') commit(host.models)
      else pending.push(commit)
      return true
    }),
    onFail: vi.fn((cb: (r: GlFailure) => void) => failed.push(cb)),
    dispose: vi.fn(),
  }
  host.ready.catch(() => {})
  return {
    host,
    pending,
    loaded: () => settleLoad.resolve(),
    loadFails: () => settleLoad.reject(new Error('404')),
    ready: () => {
      host.accepting = true
      settleReady.resolve()
    },
    // as the real worker host, a worker that stops also rejects a pending load
    neverReady: () => {
      settleReady.reject(new Error('unsupported'))
      settleLoad.reject(new Error('stopped'))
    },
    lose: (reason: GlFailure = 'context_lost') => {
      failed.forEach((cb) => cb(reason))
      settleLoad.reject(new Error('stopped'))
    },
    land: (models: boolean) => pending.shift()!(models),
  }
}

const made = vi.hoisted(() => ({
  worker: [] as Array<ReturnType<typeof fakeHost>>,
  main: [] as Array<ReturnType<typeof fakeHost>>,
  workerThrows: false,
  mainThrows: false,
}))

vi.mock('@/features/desk/gl/worker-host', () => ({
  createWorkerHost: () => {
    if (made.workerThrows) throw new Error('no bitmaprenderer')
    const f = fakeHost('worker')
    made.worker.push(f)
    return f.host
  },
}))
vi.mock('@/features/desk/gl/main-host', () => ({
  createMainHost: () => {
    if (made.mainThrows) throw new Error('Error creating WebGL context.')
    const f = fakeHost('main')
    made.main.push(f)
    return f.host
  },
}))

const { selectHost } = await import('@/features/desk/gl/select-host')
const { GlHostError } = await import('@/features/desk/gl/host')

const URLS = [{ model: '/m.glb', texture: '/t.avif' }]
const camera = { view: new Float64Array(16), projection: new Float64Array(16) }
const flush = () => new Promise((r) => setTimeout(r, 0))

let container: HTMLElement

beforeEach(() => {
  made.worker.length = 0
  made.main.length = 0
  made.workerThrows = false
  made.mainThrows = false
  vi.stubGlobal('Worker', class {})
  vi.stubGlobal('OffscreenCanvas', class { transferToImageBitmap() {} })
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  container.remove()
  vi.unstubAllGlobals()
})

/** The host as the engine holds it: its canvas in the page, styled. */
function mount(search = '') {
  const host = selectHost(URLS, search)
  host.canvas.style.position = 'absolute'
  host.canvas.style.zIndex = '1'
  container.append(host.canvas)
  return host
}

describe('selectHost', () => {
  it('tries the worker first, and draws there once it is ready', async () => {
    const host = mount()
    expect(made.worker).toHaveLength(1)
    expect(host.kind).toBe('worker')
    expect(host.canvas).toBe(made.worker[0]!.host.canvas)
    made.worker[0]!.ready()
    await flush()
    const commit = vi.fn()
    expect(host.render(camera, commit)).toBe(true)
    made.worker[0]!.land(true)
    expect(commit).toHaveBeenCalledWith(true)
    expect(made.main).toHaveLength(0)
  })

  it('falls back to the main thread when the worker cannot render, without reporting a failure', async () => {
    const host = mount()
    const onFail = vi.fn()
    host.onFail(onFail)
    void host.load()
    made.worker[0]!.neverReady()
    await flush()
    expect(made.main).toHaveLength(1)
    // nothing shown yet: the main host takes over with the next frame, its models still loading
    const commit = vi.fn()
    expect(host.render(camera, commit)).toBe(true)
    expect(commit).toHaveBeenCalledWith(false)
    expect(host.kind).toBe('main')
    expect(container.contains(made.main[0]!.host.canvas)).toBe(true)
    expect(container.contains(made.worker[0]!.host.canvas)).toBe(false)
    expect(made.worker[0]!.host.dispose).toHaveBeenCalled()
    expect(onFail).not.toHaveBeenCalled()
  })

  it('goes straight to the main host without OffscreenCanvas, or with ?deskHost=main', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(selectHost(URLS, '').kind).toBe('main')
    vi.stubGlobal('OffscreenCanvas', class { transferToImageBitmap() {} })
    expect(selectHost(URLS, '?deskHost=main').kind).toBe('main')
    expect(made.worker).toHaveLength(0)
    expect(made.main).toHaveLength(2)
  })

  it('goes straight to the main host where a worker cannot be started', () => {
    made.workerThrows = true
    expect(selectHost(URLS, '').kind).toBe('main')
  })

  it('throws where neither can draw, so the scene reports webgl_unavailable', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    made.mainThrows = true
    expect(() => selectHost(URLS, '')).toThrow()
  })
})

describe('a worker that fails after it has drawn', () => {
  /** A worker host that is ready, loaded, and has put frames with the models on screen. */
  async function drawing() {
    const host = mount()
    host.resize(600, 400, 2)
    const loading = host.load()
    const worker = made.worker[0]!
    worker.ready()
    worker.loaded()
    await loading
    host.render(camera, vi.fn())
    worker.land(true)
    return { host, worker }
  }

  it('keeps its last frame up until the main thread can draw the same scene, then swaps in one commit', async () => {
    const { host, worker } = await drawing()
    host.canvas.style.width = '600px' // a worker frame still at its drawn size
    worker.lose()
    const main = made.main[0]!
    // the main thread draws from now on, though the worker's frame is still the one up
    expect(host.kind).toBe('main')
    expect(main.host.resize).toHaveBeenCalledWith(600, 400, 2)
    expect(main.host.load).toHaveBeenCalledTimes(1)
    // the models are not in the main scene yet: no frame, the worker's last one stays up
    expect(host.render(camera, vi.fn())).toBe(false)
    expect(container.contains(worker.host.canvas)).toBe(true)
    main.host.models = true
    main.loaded()
    await flush()
    const log: string[] = []
    const commit = vi.fn(() => log.push(`commit, main canvas in page: ${container.contains(main.host.canvas)}`))
    expect(host.render(camera, commit)).toBe(true)
    expect(log).toEqual(['commit, main canvas in page: true'])
    expect(commit).toHaveBeenCalledWith(true)
    expect(container.contains(worker.host.canvas)).toBe(false)
    // where the engine put and styled the old canvas, at the stylesheet's size
    expect(main.host.canvas.style).toMatchObject({ position: 'absolute', zIndex: '1', width: '' })
    expect(host.kind).toBe('main')
    expect(host.canvas).toBe(main.host.canvas)
    expect(worker.host.dispose).toHaveBeenCalledTimes(1)
    host.resize(800, 500, 1)
    expect(main.host.resize).toHaveBeenLastCalledWith(800, 500, 1)
  })

  it('reports load_error if the main thread then cannot load the models', async () => {
    const { host, worker } = await drawing()
    const onFail = vi.fn()
    host.onFail(onFail)
    worker.lose()
    made.main[0]!.loadFails()
    await flush()
    expect(onFail).toHaveBeenCalledWith('load_error')
  })

  it('reports webgl_unavailable if the main thread has no WebGL either', async () => {
    const { host, worker } = await drawing()
    const onFail = vi.fn()
    host.onFail(onFail)
    made.mainThrows = true
    worker.lose()
    expect(onFail).toHaveBeenCalledWith('webgl_unavailable')
    expect(host.render(camera, vi.fn())).toBe(false)
  })

  it("passes on the main host's own lost context", async () => {
    const { host, worker } = await drawing()
    const onFail = vi.fn()
    host.onFail(onFail)
    worker.lose()
    made.main[0]!.lose('context_lost')
    expect(onFail).toHaveBeenCalledWith('context_lost')
  })
})

describe('loading through a fallback', () => {
  it('a worker whose load fails hands the load to the main thread', async () => {
    const host = mount()
    const loading = host.load()
    const worker = made.worker[0]!
    worker.ready()
    worker.loadFails()
    await flush()
    expect(made.main).toHaveLength(1)
    made.main[0]!.loaded()
    await expect(loading).resolves.toBeUndefined()
  })

  it('rejects the load when the main thread fails it too', async () => {
    const host = mount()
    const loading = host.load()
    const onFail = vi.fn()
    host.onFail(onFail)
    made.worker[0]!.neverReady()
    await flush()
    made.main[0]!.loadFails()
    await expect(loading).rejects.toThrow()
    await flush()
    expect(onFail).not.toHaveBeenCalled()
  })

  it('rejects as webgl_unavailable when the main thread cannot be created during the load', async () => {
    const host = mount()
    const loading = host.load()
    made.mainThrows = true
    made.worker[0]!.neverReady()
    const error = await loading.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GlHostError)
    expect((error as InstanceType<typeof GlHostError>).reason).toBe('webgl_unavailable')
  })

  it('loads on the main host when the worker failed before the load was asked for', async () => {
    const host = mount()
    made.worker[0]!.neverReady()
    await flush()
    const loading = host.load()
    expect(made.main[0]!.host.load).toHaveBeenCalledTimes(1)
    made.main[0]!.loaded()
    await expect(loading).resolves.toBeUndefined()
  })
})

describe('dispose', () => {
  it('disposes the worker, and the main host if one took over', async () => {
    const host = mount()
    made.worker[0]!.neverReady()
    await flush()
    host.dispose()
    expect(made.worker[0]!.host.dispose).toHaveBeenCalledTimes(1)
    expect(made.main[0]!.host.dispose).toHaveBeenCalledTimes(1)
  })
})
