// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInView, type InViewOptions } from '@/lib/dom/use-in-view'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** An IntersectionObserver stub that records what it watches and lets the test report an intersection. */
class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | undefined
  readonly observed: Element[] = []
  disconnected = false
  readonly disconnect = vi.fn(() => {
    this.disconnected = true
  })
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.last = this
  }
  observe(target: Element) {
    this.observed.push(target)
  }
  unobserve() {}
  /** Delivers one batch with an entry per state, oldest first; like the real thing, silent once disconnected. */
  report(...states: boolean[]) {
    if (this.disconnected) return
    const entries = states.map((isIntersecting) => ({ isIntersecting }) as IntersectionObserverEntry)
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

const seen: boolean[] = []
let options: InViewOptions | undefined

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  seen.push(useInView(ref, options))
  return createElement('div', { ref })
}

let host: HTMLElement
let root: Root
const observer = () => FakeIntersectionObserver.last!

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  FakeIntersectionObserver.last = undefined
  seen.length = 0
  options = undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('useInView', () => {
  it('starts out of view and observes the element', () => {
    act(() => root.render(createElement(Harness)))
    expect(seen.at(-1)).toBe(false)
    expect(observer().observed).toEqual([host.firstElementChild])
  })

  it('follows the element in and out of view', () => {
    act(() => root.render(createElement(Harness)))
    act(() => observer().report(true))
    expect(seen.at(-1)).toBe(true)
    act(() => observer().report(false))
    expect(seen.at(-1)).toBe(false)
    expect(observer().disconnect).not.toHaveBeenCalled()
  })

  it('passes the root margin to the observer', () => {
    options = { rootMargin: '200px' }
    act(() => root.render(createElement(Harness)))
    expect(observer().options?.rootMargin).toBe('200px')
  })

  it('with once, latches true and stops observing on the first intersection', () => {
    options = { once: true }
    act(() => root.render(createElement(Harness)))
    act(() => observer().report(false))
    expect(observer().disconnect).not.toHaveBeenCalled()
    act(() => observer().report(true))
    expect(seen.at(-1)).toBe(true)
    expect(observer().disconnect).toHaveBeenCalledOnce()
    act(() => observer().report(false))
    expect(seen.at(-1)).toBe(true)
  })

  it('uses the latest of several batched entries', () => {
    act(() => root.render(createElement(Harness)))
    act(() => observer().report(true, false))
    expect(seen.at(-1)).toBe(false)
    act(() => observer().report(false, true))
    expect(seen.at(-1)).toBe(true)
  })

  it('disconnects the observer on unmount', () => {
    act(() => root.render(createElement(Harness)))
    const io = observer()
    act(() => root.unmount())
    expect(io.disconnect).toHaveBeenCalledOnce()
    root = createRoot(host)
  })
})
