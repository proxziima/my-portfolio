// @vitest-environment jsdom
import { createElement, useRef } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATLAS } from '@/features/theme/rocker-atlas'
import { useRocker } from '@/features/theme/use-rocker'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

type Api = ReturnType<typeof useRocker>
let api: Api
let host: HTMLElement
let root: Root
let raf: ReturnType<typeof vi.spyOn>
const ctx = { clearRect: vi.fn(), drawImage: vi.fn() }

function Harness({ initial, reduce }: { initial: 0 | 1; reduce: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  api = useRocker(canvasRef, initial, reduce)
  return createElement('canvas', { ref: canvasRef, width: 212, height: 280 })
}

const mount = async (initial: 0 | 1 = 0, reduce = false) => {
  await act(async () => {
    root.render(createElement(Harness, { initial, reduce }))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1060)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(1120)
  HTMLImageElement.prototype.decode = () => Promise.resolve()
  raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1)
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  ctx.clearRect.mockClear()
  ctx.drawImage.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('useRocker, decoding off the main thread', () => {
  const bitmap = (width = 1060, height = 1120) => ({ width, height, close: vi.fn() })
  let decode: ReturnType<typeof vi.fn>
  let fetchMock: ReturnType<typeof vi.fn>
  const blob = new Blob(['webp'])

  beforeEach(() => {
    decode = vi.fn(() => Promise.resolve(bitmap()))
    fetchMock = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(blob) }))
    vi.stubGlobal('createImageBitmap', decode)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the atlas and decodes it with createImageBitmap, then draws from the bitmap', async () => {
    const decoded = bitmap()
    decode.mockResolvedValueOnce(decoded)
    await mount(1)
    // at an image's priority: a fetch() is High by default and would compete with the page's own resources
    expect(fetchMock).toHaveBeenCalledWith(ATLAS.src, { priority: 'low' })
    // the blob as fetched, with the defaults: the same pixels drawImage would take from an <img>
    expect(decode).toHaveBeenCalledWith(blob)
    expect(api.ready).toBe(true)
    expect(ctx.drawImage).toHaveBeenLastCalledWith(decoded, 212, 840, 212, 280, 0, 0, 212, 280)
  })

  it('never decodes on the main thread through an <img> when it can do so off it', async () => {
    const imageDecode = vi.fn(() => Promise.resolve())
    HTMLImageElement.prototype.decode = imageDecode
    await mount()
    expect(imageDecode).not.toHaveBeenCalled()
  })

  it('stays on the fallback when the decoded atlas has the wrong size, and frees it', async () => {
    const wrong = bitmap(1060, 1000)
    decode.mockResolvedValueOnce(wrong)
    await mount()
    expect(api.ready).toBe(false)
    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(wrong.close).toHaveBeenCalled()
  })

  it('stays on the fallback when the atlas cannot be fetched', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, blob: () => Promise.resolve(blob) })
    await mount()
    expect(api.ready).toBe(false)
    expect(decode).not.toHaveBeenCalled()
  })

  it('animates from the bitmap like from the image', async () => {
    await mount()
    act(() => api.flipTo(1))
    expect(raf).toHaveBeenCalledTimes(1)
  })

  it('frees the bitmap on unmount', async () => {
    const decoded = bitmap()
    decode.mockResolvedValueOnce(decoded)
    await mount()
    act(() => root.unmount())
    expect(decoded.close).toHaveBeenCalled()
    root = createRoot(host) // afterEach unmounts again
  })
})

describe('useRocker, where createImageBitmap is missing (decoded through an <img>)', () => {
  it('becomes ready once a valid atlas is decoded, drawing the resting frame', async () => {
    await mount(1)
    expect(api.ready).toBe(true)
    // frame 16 sits at column 1, row 3
    expect(ctx.drawImage).toHaveBeenLastCalledWith(expect.anything(), 212, 840, 212, 280, 0, 0, 212, 280)
  })

  it('stays on the fallback when the atlas has the wrong size', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(1000)
    await mount()
    expect(api.ready).toBe(false)
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })

  it('animates a normal flip on rAF', async () => {
    await mount()
    act(() => api.flipTo(1))
    expect(raf).toHaveBeenCalledTimes(1)
  })

  it('jumps without scheduling a frame when instant', async () => {
    await mount()
    ctx.drawImage.mockClear()
    act(() => api.flipTo(1, false, true))
    expect(raf).not.toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenLastCalledWith(expect.anything(), 212, 840, 212, 280, 0, 0, 212, 280)
  })

  it('jumps under reduced motion', async () => {
    await mount(0, true)
    act(() => api.flipTo(1))
    expect(raf).not.toHaveBeenCalled()
  })

  it('leaves a flip already heading to the same target alone', async () => {
    await mount()
    act(() => api.flipTo(1))
    act(() => api.flipTo(1))
    expect(raf).toHaveBeenCalledTimes(1)
  })

  it('snaps a running flip to its end before starting the next one', async () => {
    const cancel = vi.mocked(globalThis.cancelAnimationFrame)
    raf.mockReturnValueOnce(11).mockReturnValueOnce(12)
    await mount()
    act(() => api.flipTo(1))
    ctx.drawImage.mockClear()
    act(() => api.flipTo(0))
    expect(cancel).toHaveBeenCalledWith(11)
    // the interrupted flip is drawn at frame 16 (col 1, row 3) before the new flip starts
    expect(ctx.drawImage.mock.calls[0]).toEqual([expect.anything(), 212, 840, 212, 280, 0, 0, 212, 280])
    expect(raf).toHaveBeenCalledTimes(2)
  })
})
