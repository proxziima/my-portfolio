// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTypewriter } from '@/features/os/use-typewriter'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const LINES = ['ab', 'c'] as const
const seen: string[][] = []
const onDone = vi.fn()

function Harness({ instant }: { instant: boolean }) {
  seen.push(useTypewriter(LINES, { charMs: 10, lineMs: 50, instant, onDone }))
  return null
}

let host: HTMLElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  seen.length = 0
  onDone.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('useTypewriter', () => {
  it('types character by character, pauses between lines, then reports done', () => {
    act(() => root.render(createElement(Harness, { instant: false })))
    expect(seen.at(-1)).toEqual([])
    act(() => vi.advanceTimersByTime(10))
    expect(seen.at(-1)).toEqual(['a'])
    act(() => vi.advanceTimersByTime(10))
    expect(seen.at(-1)).toEqual(['ab'])
    act(() => vi.advanceTimersByTime(49))
    expect(seen.at(-1)).toEqual(['ab'])
    act(() => vi.advanceTimersByTime(1))
    expect(seen.at(-1)).toEqual(['ab', 'c'])
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(50))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('shows everything at once and reports done when instant', () => {
    act(() => root.render(createElement(Harness, { instant: true })))
    expect(seen.at(-1)).toEqual(['ab', 'c'])
    expect(onDone).toHaveBeenCalledOnce()
  })
})
