import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeskGl } from '@/features/desk/gl/desk-gl'
import type { FromWorker, ToWorker } from '@/features/desk/gl/protocol'

const { serveDesk } = await import('@/features/desk/gl/desk.worker')

/** An OffscreenCanvas stand-in: hands out numbered bitmaps and can lose its context. */
function fakeCanvas() {
  const target = new EventTarget()
  let n = 0
  return Object.assign(target, { transferToImageBitmap: vi.fn(() => ({ n: ++n }) as unknown as ImageBitmap) }) as unknown as OffscreenCanvas & EventTarget
}

let posted: Array<{ message: FromWorker; transfer: Transferable[] }>
let scope: { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage: (m: FromWorker, t: Transferable[]) => void }
let desk: { load: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
let models: boolean

const send = (data: ToWorker) => scope.onmessage!({ data } as MessageEvent<ToWorker>)
const types = () => posted.map((p) => p.message.type)
const camera = { view: new Float64Array(16).fill(1), projection: new Float64Array(16).fill(2) }

beforeEach(() => {
  posted = []
  models = false
  scope = { onmessage: null, postMessage: (message, transfer) => posted.push({ message, transfer }) }
  desk = { load: vi.fn(async () => {}), resize: vi.fn(), render: vi.fn(() => models), dispose: vi.fn() }
})

const serve = (fail = false) =>
  serveDesk(scope, (canvas) => {
    if (fail) throw new Error('Error creating WebGL context.')
    return { canvas, ...desk } as unknown as DeskGl
  })

describe('the desk worker', () => {
  it('answers init with ready once it has a context, or unsupported', () => {
    serve()
    send({ type: 'init', canvas: fakeCanvas() })
    expect(types()).toEqual(['ready'])
    serve(true)
    send({ type: 'init', canvas: fakeCanvas() })
    expect(types()).toEqual(['ready', 'unsupported'])
  })

  it('draws each render with its camera and sends the frame back, transferred, with its id', () => {
    serve()
    const canvas = fakeCanvas()
    send({ type: 'init', canvas })
    send({ type: 'render', id: 7, ...camera })
    expect(desk.render).toHaveBeenCalledWith(camera)
    const frame = posted.at(-1)!
    expect(frame.message).toEqual({ type: 'frame', id: 7, bitmap: { n: 1 }, models: false })
    expect(frame.transfer).toEqual([{ n: 1 }])
    models = true
    send({ type: 'render', id: 8, ...camera })
    expect(posted.at(-1)!.message).toMatchObject({ id: 8, models: true })
  })

  it('loads the URLs it is sent and says so, or fails as load_error', async () => {
    serve()
    send({ type: 'init', canvas: fakeCanvas() })
    const urls = [{ model: '/m.glb', texture: '/t.avif' }]
    send({ type: 'load', assets: urls })
    expect(desk.load).toHaveBeenCalledWith(urls)
    await vi.waitFor(() => expect(types()).toContain('loaded'))
    desk.load.mockRejectedValueOnce(new Error('404'))
    send({ type: 'load', assets: urls })
    await vi.waitFor(() => expect(posted.at(-1)!.message).toEqual({ type: 'failed', reason: 'load_error' }))
  })

  it('resizes the scene', () => {
    serve()
    send({ type: 'init', canvas: fakeCanvas() })
    send({ type: 'resize', width: 600, height: 400, pixelRatio: 2 })
    expect(desk.resize).toHaveBeenCalledWith(600, 400, 2)
  })

  it('reports a lost context once and never sends a frame drawn without one', () => {
    serve()
    const canvas = fakeCanvas()
    send({ type: 'init', canvas })
    canvas.dispatchEvent(new Event('webglcontextlost'))
    canvas.dispatchEvent(new Event('webglcontextlost'))
    send({ type: 'render', id: 1, ...camera })
    expect(types()).toEqual(['ready', 'failed'])
    expect(posted.at(-1)!.message).toEqual({ type: 'failed', reason: 'context_lost' })
    expect(canvas.transferToImageBitmap).not.toHaveBeenCalled()
  })

  it('ignores renders before it has a context', () => {
    serve(true)
    send({ type: 'init', canvas: fakeCanvas() })
    send({ type: 'render', id: 1, ...camera })
    expect(types()).toEqual(['unsupported'])
  })
})
