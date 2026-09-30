// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/audio/bulb', () => ({ playBulb: vi.fn(), preloadBulb: vi.fn() }))
vi.mock('@/lib/audio/poof', () => ({ playPoof: vi.fn() }))
vi.mock('@/lib/audio/thud', () => ({ playThud: vi.fn() }))

const { runBlowout } = await import('@/features/blowout/sequence')
const { playThud } = await import('@/lib/audio/thud')
const { playPoof } = await import('@/lib/audio/poof')

const root = document.documentElement
const drawImage = vi.fn()
let switchEl: HTMLElement
let source: HTMLCanvasElement

const leftovers = () => document.querySelectorAll('.bo-flash, .bo-veil, .bo-fall, .bo-shard, .bo-puff').length

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  document.body.innerHTML = '<main><div data-anchor="switch" class="switcher"><button><canvas width="212" height="280"></canvas></button></div></main>'
  switchEl = document.querySelector('[data-anchor="switch"]')!
  source = switchEl.querySelector('canvas')!
  vi.spyOn(switchEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(900, 36, 45, 59))
  root.setAttribute('data-theme', 'light')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  drawImage.mockClear()
  root.removeAttribute('data-theme')
  root.removeAttribute('data-blackout')
})

describe('runBlowout', () => {
  it('blacks out, drops a ghost with the canvas pixels and sprays 16 shards', () => {
    void runBlowout({ switchEl, reduce: false })
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.hasAttribute('data-blackout')).toBe(true)
    const ghost = document.querySelector<HTMLElement>('.bo-fall')!
    expect(ghost.hasAttribute('data-anchor')).toBe(false)
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0)
    expect(switchEl.style.opacity).toBe('0')
    expect(switchEl.style.visibility).toBe('')
    expect(document.querySelectorAll('.bo-shard')).toHaveLength(16)
    vi.advanceTimersByTime(20)
    expect(document.querySelector('.bo-flash')!.classList.contains('in')).toBe(true)
  })

  it('falls, thuds on the floor, recovers at 3.3s and cleans up by 4.8s', async () => {
    let done = false
    void runBlowout({ switchEl, reduce: false }).then(() => { done = true })
    vi.advanceTimersByTime(3299)
    expect(playThud).toHaveBeenCalled()
    expect(document.querySelector<HTMLElement>('.bo-fall')!.style.transform).toMatch(/^translate\(.+\) rotate\(.+rad\)$/)
    vi.advanceTimersByTime(1)
    expect(playPoof).toHaveBeenCalled()
    expect(switchEl.style.opacity).toBe('')
    expect(root.getAttribute('data-theme')).toBe('dark')
    vi.advanceTimersByTime(160)
    expect(root.getAttribute('data-theme')).toBe('light')
    expect(root.hasAttribute('data-blackout')).toBe(false)
    vi.advanceTimersByTime(360)
    expect(document.querySelector('.bo-veil')!.classList.contains('out')).toBe(true)
    await vi.advanceTimersByTimeAsync(980)
    expect(leftovers()).toBe(0)
    expect(done).toBe(true)
  })

  it('restores a system theme as no explicit theme', async () => {
    root.removeAttribute('data-theme')
    const run = runBlowout({ switchEl, reduce: true })
    await vi.advanceTimersByTimeAsync(4800)
    await run
    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(leftovers()).toBe(0)
  })

  it('under reduced motion drops the ghost straight to the floor with no shards', () => {
    void runBlowout({ switchEl, reduce: true })
    expect(document.querySelectorAll('.bo-shard')).toHaveLength(0)
    expect(document.querySelector<HTMLElement>('.bo-fall')!.style.transform).toContain('rotate(.35rad)')
  })

  it('tears everything down when aborted mid-sequence', async () => {
    const controller = new AbortController()
    const run = runBlowout({ switchEl, reduce: false, signal: controller.signal })
    vi.advanceTimersByTime(1000)
    controller.abort()
    await run
    expect(leftovers()).toBe(0)
    expect(switchEl.style.opacity).toBe('')
    expect(root.getAttribute('data-theme')).toBe('light')
    expect(root.hasAttribute('data-blackout')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
