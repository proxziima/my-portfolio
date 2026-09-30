// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TEXT_PROXY_CLASS, useHideSplineTextProxy } from '@/features/figure/use-hide-spline-text-proxy'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

function Harness() {
  useHideSplineTextProxy()
  return null
}

/** A textarea styled the way the Spline runtime's `createInput()` styles its proxy. */
const proxy = () => {
  const t = document.createElement('textarea')
  t.style.cssText = 'position: fixed; top: 200px; left: 400px; z-index: -1; opacity: .5; font-size: 40px'
  return t
}
/** MutationObserver callbacks are microtasks. */
const flush = () => act(async () => { await Promise.resolve() })

let host: HTMLElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
})

describe('useHideSplineTextProxy', () => {
  it('marks the runtime proxy textarea when it is appended to the body', async () => {
    act(() => root.render(createElement(Harness)))
    const t = proxy()
    document.body.append(t)
    await flush()
    expect(t.classList.contains(TEXT_PROXY_CLASS)).toBe(true)
  })

  it('marks a proxy that is already there when it mounts', () => {
    const t = proxy()
    document.body.append(t)
    act(() => root.render(createElement(Harness)))
    expect(t.classList.contains(TEXT_PROXY_CLASS)).toBe(true)
  })

  it('leaves ordinary textareas alone', async () => {
    act(() => root.render(createElement(Harness)))
    const plain = document.createElement('textarea')
    const fixedOnly = document.createElement('textarea')
    fixedOnly.style.position = 'fixed'
    document.body.append(plain, fixedOnly)
    await flush()
    expect(plain.classList.contains(TEXT_PROXY_CLASS)).toBe(false)
    expect(fixedOnly.classList.contains(TEXT_PROXY_CLASS)).toBe(false)
  })

  it('stops watching once unmounted', async () => {
    act(() => root.render(createElement(Harness)))
    act(() => root.unmount())
    const t = proxy()
    document.body.append(t)
    await flush()
    expect(t.classList.contains(TEXT_PROXY_CLASS)).toBe(false)
    root = createRoot(host)
  })
})
