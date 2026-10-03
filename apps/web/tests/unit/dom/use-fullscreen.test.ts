// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFullscreen } from '@/lib/dom/use-fullscreen'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

type Api = ReturnType<typeof useFullscreen>
let latest: Api | undefined

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  latest = useFullscreen(ref)
  return createElement('div', { ref, id: 'box' })
}

let host: HTMLElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(createElement(Harness)))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete document.documentElement.dataset.fullscreen
})

// jsdom has no Fullscreen API: this is the CSS-only path, which iOS Safari also takes
describe('useFullscreen', () => {
  it('starts off and does not touch the root', () => {
    expect(latest?.on).toBe(false)
    expect(document.documentElement.dataset.fullscreen).toBeUndefined()
  })

  it('enter turns it on and locks the page; exit undoes both', () => {
    act(() => latest?.enter())
    expect(latest?.on).toBe(true)
    expect(document.documentElement.dataset.fullscreen).toBe('true')
    act(() => latest?.exit())
    expect(latest?.on).toBe(false)
    expect(document.documentElement.dataset.fullscreen).toBeUndefined()
  })

  it('toggle flips it', () => {
    act(() => latest?.toggle())
    expect(latest?.on).toBe(true)
    act(() => latest?.toggle())
    expect(latest?.on).toBe(false)
  })

  it('Escape exits', () => {
    act(() => latest?.enter())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(latest?.on).toBe(false)
  })

  it('unmounting while on releases the page lock', () => {
    act(() => latest?.enter())
    act(() => root.unmount())
    expect(document.documentElement.dataset.fullscreen).toBeUndefined()
    root = createRoot(host)
  })
})
