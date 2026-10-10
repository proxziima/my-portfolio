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
  /** The last fake's screen, and the callback the scene gave its `onLoaded`. */
  screen: undefined as { element: HTMLElement; iframe: null; powerOn: ReturnType<typeof vi.fn>; onLoaded: ReturnType<typeof vi.fn> } | undefined,
  loaded: undefined as (() => void) | undefined,
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
  engine.loaded = undefined
  engine.screen = {
    element: document.createElement('div'),
    iframe: null,
    powerOn: vi.fn(),
    onLoaded: vi.fn((cb: () => void) => {
      engine.loaded = cb
      return () => {}
    }),
  }
  return {
    screen: engine.screen,
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
const onPower = vi.fn()

const mount = async (fullscreen = false) => {
  await act(async () => root.render(createElement(DeskScene, { onFail, onReady, muted: true, fullscreen, onPower })))
}

/** jsdom has no PointerEvent constructor: a plain event carrying `pointerType`. */
function pointer(type: string, pointerType: string): Event {
  const e = new Event(type)
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  return e
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  onFail.mockClear()
  onReady.mockClear()
  onPower.mockClear()
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

describe('DeskScene power', () => {
  beforeEach(() => {
    engine.create = fakeEngine(async () => {})
  })

  it('leaves the monitor off at mount', async () => {
    await mount()
    expect(engine.screen?.powerOn).not.toHaveBeenCalled()
    expect(onPower).not.toHaveBeenCalledWith('booting')
  })

  it('boots when a mouse enters the figure box, and reports booting then on', async () => {
    await mount()
    act(() => {
      host.dispatchEvent(pointer('pointerenter', 'mouse'))
    })
    expect(engine.screen?.powerOn).toHaveBeenCalledTimes(1)
    expect(onPower).toHaveBeenLastCalledWith('booting')
    act(() => engine.loaded?.())
    expect(onPower).toHaveBeenLastCalledWith('on')
  })

  it('boots on full screen', async () => {
    await mount()
    await mount(true)
    expect(engine.screen?.powerOn).toHaveBeenCalled()
    expect(onPower).toHaveBeenCalledWith('booting')
  })

  it('boots when keyboard focus reaches the powered-off screen', async () => {
    await mount()
    act(() => {
      engine.screen?.element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    expect(engine.screen?.powerOn).toHaveBeenCalled()
  })
})
