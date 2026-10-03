import { describe, expect, it } from 'vitest'
import { cubicBezier, quinticInOut } from '@/features/desk/ease'

describe('quinticInOut', () => {
  it('is symmetric around the midpoint', () => {
    expect(quinticInOut(0)).toBe(0)
    expect(quinticInOut(0.5)).toBe(0.5)
    expect(quinticInOut(1)).toBe(1)
    expect(quinticInOut(0.25)).toBeCloseTo(1 - quinticInOut(0.75), 10)
  })
})

describe('cubicBezier', () => {
  const ease = cubicBezier(0.13, 0.99, 0, 1)
  it('pins the endpoints and clamps outside [0, 1]', () => {
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    expect(ease(-1)).toBe(0)
    expect(ease(2)).toBe(1)
  })
  it('is a strong ease-out: most of the way there at the midpoint', () => {
    expect(ease(0.5)).toBeGreaterThan(0.9)
  })
  it('is monotonic', () => {
    let prev = 0
    for (let i = 1; i <= 100; i++) {
      const v = ease(i / 100)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
  it('matches CSS linear for the identity curve', () => {
    const linear = cubicBezier(0, 0, 1, 1)
    expect(linear(0.3)).toBeCloseTo(0.3, 6)
  })
})
