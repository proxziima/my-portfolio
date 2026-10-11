// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FromWorker, ToWorker } from '@/features/desk/gl/protocol'

/** The one worker the host under test started: what it was sent, and a way to answer. */
class FakeWorker {
  static last: FakeWorker
  url: URL
  options: WorkerOptions
  sent: Array<{ message: ToWorker; transfer: Transferable[] }> = []
  terminated = false
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onmessageerror: ((e: Event) => void) | null = null
  constructor(url: URL, options: WorkerOptions) {
    this.url = url
    this.options = options
    FakeWorker.last = this
  }
  postMessage(message: ToWorker, transfer: Transferable[] = []) {
    this.sent.push({ message, transfer })
  }
  terminate() {
    this.terminated = true
  }
  answer(data: FromWorker) {
    this.onmessage?.({ data } as MessageEvent<FromWorker>)
  }
  fail() {
    this.onerror?.(new Event('error'))
  }
  types() {
    return this.sent.map((s) => s.message.type)
  }
}

class FakeOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  transferToImageBitmap() {
    return {} as ImageBitmap
  }
}

const log: string[] = []
const bitmapView = { transferFromImageBitmap: vi.fn((b: unknown) => log.push(`bitmap ${(b as { n: number }).n}`)) }
let bitmapRenderer: typeof bitmapView | null

const { createWorkerHost } = await import('@/features/desk/gl/worker-host')

const URLS = [{ model: '/m.glb', texture: { avif: '/t.avif', webp: '/t.webp', width: 2048, height: 2048 } }]
const camera = { view: new Float64Array(16).fill(1), projection: new Float64Array(16).fill(2) }
const bitmap = (n: number) => ({ n, close: vi.fn() }) as unknown as ImageBitmap

beforeEach(() => {
  log.length = 0
  bitmapView.transferFromImageBitmap.mockClear()
  bitmapRenderer = bitmapView
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) => (type === 'bitmaprenderer' ? bitmapRenderer : null)) as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A host whose worker has answered `ready`. */
async function readyHost() {
  const host = createWorkerHost(URLS)
  FakeWorker.last.answer({ type: 'ready' })
  await host.ready
  return { host, worker: FakeWorker.last }
}

describe('createWorkerHost', () => {
  it('starts the desk worker as a module and hands it an OffscreenCanvas, transferred', () => {
    const host = createWorkerHost(URLS)
    const worker = FakeWorker.last
    expect(worker.url.pathname).toMatch(/desk\.worker\.ts$/)
    expect(worker.options).toEqual({ type: 'module', name: 'desk' })
    const [init] = worker.sent
    expect(init!.message.type).toBe('init')
    const canvas = (init!.message as Extract<ToWorker, { type: 'init' }>).canvas
    expect(canvas).toBeInstanceOf(FakeOffscreenCanvas)
    expect(init!.transfer).toEqual([canvas])
    expect(host.kind).toBe('worker')
    expect(host.canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(host.canvas.style.display).toBe('block')
  })

  it('throws at once where a canvas has no bitmaprenderer, before starting a worker', () => {
    bitmapRenderer = null
    const before = FakeWorker.last
    expect(() => createWorkerHost(URLS)).toThrow()
    expect(FakeWorker.last).toBe(before)
  })

  it('is ready when the worker has a context', async () => {
    const host = createWorkerHost(URLS)
    FakeWorker.last.answer({ type: 'ready' })
    await expect(host.ready).resolves.toBeUndefined()
  })

  it.each([
    ['unsupported', (w: FakeWorker) => w.answer({ type: 'unsupported' })],
    ['a worker error', (w: FakeWorker) => w.fail()],
  ])('is never ready on %s, and stops the worker', async (_, act) => {
    const host = createWorkerHost(URLS)
    act(FakeWorker.last)
    await expect(host.ready).rejects.toThrow()
    expect(FakeWorker.last.terminated).toBe(true)
  })

  it('gives up after 3 s without an answer', async () => {
    vi.useFakeTimers()
    const host = createWorkerHost(URLS)
    const rejected = expect(host.ready).rejects.toThrow('timeout')
    vi.advanceTimersByTime(2999)
    expect(FakeWorker.last.terminated).toBe(false)
    vi.advanceTimersByTime(1)
    await rejected
    expect(FakeWorker.last.terminated).toBe(true)
  })

  it('skips frames until it is ready', () => {
    const host = createWorkerHost(URLS)
    expect(host.render(camera, vi.fn())).toBe(false)
    expect(FakeWorker.last.types()).toEqual(['init'])
  })

  it('asks for frames with increasing ids and this camera', async () => {
    const { host, worker } = await readyHost()
    expect(host.render(camera, vi.fn())).toBe(true)
    expect(host.render(camera, vi.fn())).toBe(true)
    const renders = worker.sent.filter((s) => s.message.type === 'render').map((s) => s.message)
    expect(renders).toEqual([
      { type: 'render', id: 1, view: camera.view, projection: camera.projection },
      { type: 'render', id: 2, view: camera.view, projection: camera.projection },
    ])
  })

  it('puts a frame on the canvas, then commits it, in the same message', async () => {
    const { host, worker } = await readyHost()
    const commit = vi.fn((models: boolean) => log.push(`commit ${models}`))
    host.render(camera, commit)
    expect(commit).not.toHaveBeenCalled()
    worker.answer({ type: 'frame', id: 1, bitmap: bitmap(1), models: true })
    expect(log).toEqual(['bitmap 1', 'commit true'])
  })

  it('skips a frame with three in flight, sending nothing', async () => {
    const { host, worker } = await readyHost()
    for (let i = 0; i < 3; i++) expect(host.render(camera, vi.fn())).toBe(true)
    const sent = worker.sent.length
    expect(host.render(camera, vi.fn())).toBe(false)
    expect(worker.sent).toHaveLength(sent)
    worker.answer({ type: 'frame', id: 1, bitmap: bitmap(1), models: false })
    expect(host.render(camera, vi.fn())).toBe(true)
  })

  it('never clears the canvas: resizing leaves the last frame up until the next one lands', async () => {
    const { host, worker } = await readyHost()
    host.resize(600, 400, 1)
    host.render(camera, vi.fn())
    worker.answer({ type: 'frame', id: 1, bitmap: bitmap(1), models: true })
    const { width, height } = host.canvas
    host.resize(800, 500, 2)
    expect(worker.sent.at(-1)!.message).toEqual({ type: 'resize', width: 800, height: 500, pixelRatio: 2 })
    // no new bitmap, no cleared bitmap, the element's own size untouched
    expect(bitmapView.transferFromImageBitmap).toHaveBeenCalledTimes(1)
    expect([host.canvas.width, host.canvas.height]).toEqual([width, height])
  })

  it('shows a frame at the size it was drawn for while a resize is in flight, so it stays on its CSS3D pose', async () => {
    const { host, worker } = await readyHost()
    host.resize(600, 400, 1)
    host.render(camera, vi.fn())
    host.resize(800, 500, 1)
    host.render(camera, vi.fn())
    worker.answer({ type: 'frame', id: 1, bitmap: bitmap(1), models: true })
    expect([host.canvas.style.width, host.canvas.style.height]).toEqual(['600px', '400px'])
    worker.answer({ type: 'frame', id: 2, bitmap: bitmap(2), models: true })
    // caught up: the stylesheet's 100% again, exactly as the main host's canvas
    expect([host.canvas.style.width, host.canvas.style.height]).toEqual(['', ''])
  })

  it('sends both texture encodes for the worker to choose; loaded resolves with the format it decoded, load_error rejects', async () => {
    const { host, worker } = await readyHost()
    const loading = host.load()
    expect(worker.sent.find((s) => s.message.type === 'load')!.message).toEqual({ type: 'load', assets: URLS })
    worker.answer({ type: 'loaded', format: 'avif' })
    await expect(loading).resolves.toBe('avif')

    const other = await readyHost()
    const failing = other.host.load()
    other.worker.answer({ type: 'failed', reason: 'load_error' })
    await expect(failing).rejects.toThrow()
  })

  it('reports a lost context or a dead worker after ready, once, stops asking for frames and rejects a pending load', async () => {
    for (const lose of [(w: FakeWorker) => w.answer({ type: 'failed', reason: 'context_lost' }), (w: FakeWorker) => w.fail()]) {
      const { host, worker } = await readyHost()
      const onFail = vi.fn()
      host.onFail(onFail)
      const loading = host.load()
      lose(worker)
      lose(worker)
      expect(onFail).toHaveBeenCalledTimes(1)
      expect(onFail).toHaveBeenCalledWith('context_lost')
      await expect(loading).rejects.toThrow()
      expect(host.render(camera, vi.fn())).toBe(false)
      expect(worker.terminated).toBe(true)
    }
  })

  it('pins its last frame at the size it was drawn for once it has failed, as no frame will follow', async () => {
    const { host, worker } = await readyHost()
    host.resize(600, 400, 1)
    host.render(camera, vi.fn())
    worker.answer({ type: 'frame', id: 1, bitmap: bitmap(1), models: true })
    expect(host.canvas.style.width).toBe('')
    worker.answer({ type: 'failed', reason: 'context_lost' })
    host.resize(800, 500, 1)
    expect([host.canvas.style.width, host.canvas.style.height]).toEqual(['600px', '400px'])
  })

  it('stops the worker on dispose', async () => {
    const { host, worker } = await readyHost()
    host.dispose()
    expect(worker.terminated).toBe(true)
  })
})
