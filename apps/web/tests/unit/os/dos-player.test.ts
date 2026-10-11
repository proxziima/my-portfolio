// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const mocks = vi.hoisted(() => ({ track: vi.fn(), load: vi.fn<() => Promise<void>>() }))
vi.mock('@/lib/analytics/events', () => ({ track: mocks.track }))
vi.mock('@/features/os/apps/dos/load-js-dos', () => ({ loadJsDos: mocks.load }))

const { DosPlayer } = await import('@/features/os/apps/dos/DosPlayer')

let host: HTMLElement
let root: Root
let run: ReturnType<typeof vi.fn<(bundleUrl: string) => Promise<unknown>>>

const mount = async () => {
  await act(async () => root.render(createElement(DosPlayer, { app: 'doom', bundleUrl: '/doom.jsdos' })))
}
const events = () => mocks.track.mock.calls.map(([event, props]) => [event, { ...props, ms: typeof props.ms }])

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocks.track.mockClear()
  mocks.load.mockReset().mockResolvedValue(undefined)
  run = vi.fn(async () => undefined)
  window.Dos = () => ({ run, stop: async () => {}, setAutolock: async () => {} })
  host = document.createElement('div')
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  delete window.Dos
})

describe('DosPlayer load timing', () => {
  it('reports the app ready once the emulator runs the bundle', async () => {
    await mount()
    expect(run).toHaveBeenCalledWith('/doom.jsdos')
    expect(events()).toEqual([['experience_ready', { experience: 'dos_app', app: 'doom', ms: 'number' }]])
  })

  it('fails as load_error when the js-dos runtime does not load', async () => {
    mocks.load.mockRejectedValue(new Error('js-dos failed to load'))
    await mount()
    expect(mocks.track).toHaveBeenCalledWith('experience_failed', { experience: 'dos_app', reason: 'load_error', app: 'doom' })
    expect(host.textContent).toContain('DOS could not start')
  })

  it('fails as run_error when the emulator cannot run the bundle', async () => {
    run.mockRejectedValue(new Error('bad bundle'))
    await mount()
    expect(mocks.track).toHaveBeenCalledWith('experience_failed', { experience: 'dos_app', reason: 'run_error', app: 'doom' })
    expect(host.textContent).toContain('DOS could not start')
  })

  it('reports nothing for a window closed before the emulator runs', async () => {
    let finish: () => void = () => {}
    run.mockReturnValue(new Promise<unknown>((resolve) => (finish = () => resolve(undefined))))
    await mount()
    act(() => root.unmount())
    await act(async () => finish())
    expect(mocks.track).not.toHaveBeenCalled()
    root = createRoot(host)
  })
})
