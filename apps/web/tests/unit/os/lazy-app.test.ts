// @vitest-environment jsdom
import { act, createElement, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OsAppProps } from '@/features/os/apps'
import { lazyApp } from '@/features/os/lazy-app'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let host: HTMLElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
})

const Stub = ({ data }: OsAppProps) => createElement('p', null, `stub ${(data as unknown as { name: string }).name}`)
const props = { data: { name: 'os' }, open: () => {}, apps: [] } as unknown as OsAppProps

describe('lazyApp', () => {
  it('loads its code on the first render, not when it is defined', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Stub }))
    const App = lazyApp(load, 'Stub')
    expect(load).not.toHaveBeenCalled()
    await act(async () => root.render(createElement(Suspense, { fallback: createElement('i', null, 'loading') }, createElement(App, props))))
    expect(load).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe('stub os')
  })

  it('shows the Suspense fallback until the code has arrived', async () => {
    let resolve!: (m: { default: typeof Stub }) => void
    const App = lazyApp(() => new Promise((r) => (resolve = r)), 'Stub')
    await act(async () => root.render(createElement(Suspense, { fallback: createElement('i', null, 'loading') }, createElement(App, props))))
    expect(host.textContent).toBe('loading')
    await act(async () => resolve({ default: Stub }))
    expect(host.textContent).toBe('stub os')
  })

  it('keeps its name for the taskbar and devtools', () => {
    expect(lazyApp(() => Promise.resolve({ default: Stub }), 'Messenger').displayName).toBe('Messenger')
  })
})
