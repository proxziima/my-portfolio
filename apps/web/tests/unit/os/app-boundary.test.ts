// @vitest-environment jsdom
import { act, createElement, Suspense, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OsAppProps } from '@/features/os/apps'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }))
vi.mock('@/lib/analytics/events', () => ({ track: mocks.track, captureException: mocks.captureException }))

const { AppBoundary } = await import('@/features/os/AppBoundary')
const { lazyApp } = await import('@/features/os/lazy-app')

let host: HTMLElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocks.track.mockClear()
  mocks.captureException.mockClear()
  // React reports every caught error on the console; the boundary is what is under test
  vi.spyOn(console, 'error').mockImplementation(() => {})
  host = document.createElement('div')
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  vi.restoreAllMocks()
})

const Stub = () => createElement('p', null, 'app')
const props = { data: {}, open: () => {}, apps: [] } as unknown as OsAppProps
type Load = () => Promise<{ default: ComponentType<OsAppProps> }>

/** A window's content beside the rest of the desktop, which must survive the app failing. */
const desktop = (App: ComponentType<OsAppProps>, app = 'messenger') =>
  createElement(
    'div',
    null,
    createElement('nav', null, 'taskbar'),
    createElement(AppBoundary, {
      app,
      children: createElement(Suspense, { fallback: createElement('i', null, 'loading') }, createElement(App, props)),
    }),
  )

const offline = new TypeError('Failed to fetch dynamically imported module')
const retryButton = () => host.querySelector('button')!

describe('AppBoundary', () => {
  it('keeps a chunk that failed to load inside its window, and reports it once', async () => {
    const App = lazyApp(() => Promise.reject(offline), 'Messenger')
    await act(async () => root.render(desktop(App)))
    expect(host.querySelector('nav')!.textContent).toBe('taskbar')
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(retryButton().textContent).toBe('Retry')
    expect(mocks.track.mock.calls).toEqual([['experience_failed', { experience: 'os_app', reason: 'chunk_load_error', app: 'messenger' }]])
    // the original error, not the wrapper: its stack points at the failed import
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
    expect(mocks.captureException).toHaveBeenCalledWith(offline)
  })

  it('imports the chunk again on Retry and shows the app once it arrives', async () => {
    const load = vi.fn<Load>().mockRejectedValueOnce(offline).mockResolvedValue({ default: Stub })
    const App = lazyApp(load, 'Messenger')
    await act(async () => root.render(desktop(App)))
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => retryButton().click())
    expect(load).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.textContent).toBe('taskbarapp')
  })

  it('stays on the message, without looping, while the chunk keeps failing', async () => {
    const load = vi.fn<Load>().mockRejectedValue(offline)
    const App = lazyApp(load, 'Messenger')
    await act(async () => root.render(desktop(App)))
    await act(async () => retryButton().click())
    expect(load).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(mocks.track).toHaveBeenCalledTimes(2)
  })

  it('tries the import again when the window is reopened after a failure', async () => {
    const load = vi.fn<Load>().mockRejectedValueOnce(offline).mockResolvedValue({ default: Stub })
    const App = lazyApp(load, 'Credits')
    await act(async () => root.render(desktop(App, 'credits')))
    await act(async () => root.render(createElement('div', null)))
    await act(async () => root.render(desktop(App, 'credits')))
    expect(load).toHaveBeenCalledTimes(2)
    expect(host.textContent).toBe('taskbarapp')
  })

  it('reports an app that crashes while rendering as a render error, still inside its window', async () => {
    const boom = new Error('boom')
    const Crash = () => {
      throw boom
    }
    await act(async () => root.render(desktop(Crash, 'credits')))
    expect(host.querySelector('nav')!.textContent).toBe('taskbar')
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(mocks.track.mock.calls).toEqual([['experience_failed', { experience: 'os_app', reason: 'render_error', app: 'credits' }]])
    expect(mocks.captureException).toHaveBeenCalledWith(boom)
  })
})
