import { describe, expect, it } from 'vitest'
import { createClickWindow } from '@/features/blowout/click-window'

describe('click window', () => {
  it('is quiet for 5 clicks, flickers from 6, blows on 10', () => {
    const w = createClickWindow()
    const results = Array.from({ length: 10 }, (_, i) => w.register(i * 100))
    expect(results.slice(0, 5).every((r) => r.kind === 'quiet' || r.kind === 'preload')).toBe(true)
    expect(results[5]).toEqual({ kind: 'flicker', level: 1 })
    expect(results[8]).toEqual({ kind: 'flicker', level: 4 })
    expect(results[9]).toEqual({ kind: 'blow' })
  })
  it('asks to preload the bulb on the 2nd fast click', () => {
    const w = createClickWindow()
    w.register(0)
    expect(w.register(100)).toEqual({ kind: 'preload' })
  })
  it('forgets clicks older than 4s', () => {
    const w = createClickWindow()
    for (let i = 0; i < 9; i++) w.register(i)
    expect(w.register(10_000).kind).toBe('quiet')
  })
  it('keeps a click exactly 4s old', () => {
    const w = createClickWindow()
    w.register(0)
    expect(w.register(4000)).toEqual({ kind: 'preload' })
  })
  it('starts over after a blow and after reset', () => {
    const w = createClickWindow()
    for (let i = 0; i < 10; i++) w.register(i)
    expect(w.register(20).kind).toBe('quiet')
    w.register(21)
    w.reset()
    expect(w.register(22).kind).toBe('quiet')
  })
})
