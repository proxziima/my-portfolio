// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/audio/bulb', () => ({ playBulb: vi.fn(), preloadBulb: vi.fn() }))
vi.mock('@/lib/audio/poof', () => ({ playPoof: vi.fn() }))
vi.mock('@/lib/audio/thud', () => ({ playThud: vi.fn() }))

const { useBlowout } = await import('@/features/blowout/use-blowout')
const { preloadBulb } = await import('@/lib/audio/bulb')

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

type Api = ReturnType<typeof useBlowout>
let api: Api
let host: HTMLElement
let root: Root
const html = document.documentElement

function Harness({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  api = useBlowout(ref, reduce)
  return createElement('main', null, createElement('div', { ref, 'data-anchor': 'switch' }))
}

const mount = (reduce = false) => act(() => root.render(createElement(Harness, { reduce })))
const click = (n: number) => { for (let i = 0; i < n; i++) api.register() }
const leftovers = () => document.querySelectorAll('.bo-flash, .bo-veil, .bo-fall, .bo-shard, .bo-puff').length

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  html.removeAttribute('data-theme')
})

describe('useBlowout', () => {
  it('stays quiet for 5 clicks and preloads the bulb from the 2nd', () => {
    mount()
    click(5)
    expect(html.hasAttribute('data-flicker')).toBe(false)
    expect(preloadBulb).toHaveBeenCalled()
    expect(api.isActive()).toBe(false)
  })

  it('flickers from the 6th click, up to level 4, and clears after 420ms', () => {
    mount()
    click(6)
    expect(html.getAttribute('data-flicker')).toBe('1')
    click(3)
    expect(html.getAttribute('data-flicker')).toBe('4')
    vi.advanceTimersByTime(420)
    expect(html.hasAttribute('data-flicker')).toBe(false)
  })

  it('does not flicker under reduced motion', () => {
    mount(true)
    click(8)
    expect(html.hasAttribute('data-flicker')).toBe(false)
  })

  it('blows on the 10th click, ignores clicks while active, and is idle again after 4.8s', async () => {
    mount()
    click(10)
    expect(api.isActive()).toBe(true)
    expect(document.querySelector('.bo-fall')).not.toBeNull()
    click(10)
    expect(document.querySelectorAll('.bo-fall')).toHaveLength(1)
    await act(() => vi.advanceTimersByTimeAsync(4800))
    expect(api.isActive()).toBe(false)
    expect(leftovers()).toBe(0)
  })

  it('frees the switch and puts the room back when the sequence fails to start', async () => {
    html.setAttribute('data-theme', 'light')
    mount()
    const switchEl = document.querySelector<HTMLElement>('[data-anchor="switch"]')!
    vi.spyOn(switchEl, 'cloneNode').mockImplementation(() => { throw new Error('boom') })
    click(10)
    await act(async () => {})
    expect(api.isActive()).toBe(false)
    expect(leftovers()).toBe(0)
    expect(switchEl.style.opacity).toBe('')
    expect(html.getAttribute('data-theme')).toBe('light')
    expect(html.hasAttribute('data-blackout')).toBe(false)
    vi.mocked(switchEl.cloneNode).mockRestore()
    click(10)
    expect(api.isActive()).toBe(true)
  })

  it('removes every leftover when unmounted mid-sequence', async () => {
    html.setAttribute('data-theme', 'light')
    mount()
    click(10)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    act(() => root.unmount())
    expect(leftovers()).toBe(0)
    expect(html.getAttribute('data-theme')).toBe('light')
    expect(html.hasAttribute('data-blackout')).toBe(false)
    root = createRoot(host)
  })
})
