// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFitScale } from '@/features/figure/use-fit-scale'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A ResizeObserver stub that records what it watches and lets the test fire a resize. */
class FakeResizeObserver {
  static last: FakeResizeObserver | undefined
  readonly observed: Element[] = []
  readonly disconnect = vi.fn()
  constructor(readonly callback: () => void) {
    FakeResizeObserver.last = this
  }
  observe(target: Element) {
    this.observed.push(target)
  }
  unobserve() {}
}

const STAGE_WIDTH = 800
const scales: number[] = []

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  scales.push(useFitScale(ref, STAGE_WIDTH))
  return createElement('div', { ref })
}

let host: HTMLElement
let root: Root
const setBoxWidth = (px: number) => Object.defineProperty(host, 'clientWidth', { configurable: true, value: px })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  FakeResizeObserver.last = undefined
  scales.length = 0
  host = document.createElement('div')
  document.body.append(host)
  setBoxWidth(600)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('useFitScale', () => {
  it('fits the element to its parent on the first layout, before paint', () => {
    act(() => root.render(createElement(Harness)))
    expect(scales.at(-1)).toBe(600 / STAGE_WIDTH)
    expect(FakeResizeObserver.last?.observed).toEqual([host])
  })

  it('refits when the parent resizes', () => {
    act(() => root.render(createElement(Harness)))
    setBoxWidth(400)
    act(() => FakeResizeObserver.last?.callback())
    expect(scales.at(-1)).toBe(0.5)
  })

  it('disconnects the observer on unmount', () => {
    act(() => root.render(createElement(Harness)))
    const observer = FakeResizeObserver.last
    act(() => root.unmount())
    expect(observer?.disconnect).toHaveBeenCalledOnce()
    root = createRoot(host)
  })
})
