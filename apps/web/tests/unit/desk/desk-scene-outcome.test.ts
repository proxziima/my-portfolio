// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

interface EngineOptions {
  onFirstFrame?: () => void
}

const engine = vi.hoisted(() => ({
  options: undefined as EngineOptions | undefined,
  create: undefined as unknown as (options: EngineOptions) => unknown,
}))

vi.mock('@/features/desk/engine', () => ({ createDeskEngine: (options: EngineOptions) => engine.create(options) }))
vi.mock('@/features/desk/audio', () => ({
  createDeskAudio: () => ({ dispose: vi.fn(), setDistance: vi.fn(), setMuted: vi.fn(), unlock: vi.fn(), mouse: vi.fn(), key: vi.fn(), keyUp: vi.fn() }),
}))
vi.mock('@/features/desk/screen-events', () => ({ watchScreen: () => () => {} }))
vi.mock('@/lib/dom/use-in-view', () => ({ useInView: () => false }))
vi.mock('@/lib/dom/use-reduced-motion', () => ({ useReducedMotion: () => false }))

const { DeskScene } = await import('@/features/desk/DeskScene')

/** A stand-in engine whose `load` settles as the test decides. */
const fakeEngine = (load: () => Promise<void>) => (options: EngineOptions) => {
  engine.options = options
  return {
    iframe: document.createElement('iframe'),
    load,
    start: vi.fn(),
    stop: vi.fn(),
    resize: vi.fn(),
    setPixelRatio: vi.fn(),
    setPointer: vi.fn(),
    setReduceMotion: vi.fn(),
    goTo: vi.fn(),
    dispose: vi.fn(),
  }
}

let host: HTMLElement
let root: Root
const onFail = vi.fn()
const onReady = vi.fn()

const mount = async () => {
  await act(async () => root.render(createElement(DeskScene, { onFail, onReady, muted: true })))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  onFail.mockClear()
  onReady.mockClear()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  host = document.createElement('div')
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
})

describe('DeskScene outcome', () => {
  it('reports ready on the first frame drawn with the models', async () => {
    engine.create = fakeEngine(async () => {})
    await mount()
    expect(onReady).not.toHaveBeenCalled()
    act(() => engine.options?.onFirstFrame?.())
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onFail).not.toHaveBeenCalled()
  })

  it('fails as webgl_unavailable when the engine cannot be created', async () => {
    engine.create = () => {
      throw new Error('Error creating WebGL context.')
    }
    await mount()
    expect(onFail).toHaveBeenCalledWith('webgl_unavailable')
  })

  it('fails as load_error when the models do not load', async () => {
    engine.create = fakeEngine(() => Promise.reject(new Error('404')))
    await mount()
    expect(onFail).toHaveBeenCalledWith('load_error')
  })
})
