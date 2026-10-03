import { describe, expect, it } from 'vitest'
import { cappedPixelRatio, MAX_PIXEL_RATIO } from '@/features/desk/pixel-ratio'

describe('cappedPixelRatio', () => {
  it('caps at MAX_PIXEL_RATIO and never goes below 1', () => {
    expect(cappedPixelRatio(3)).toBe(MAX_PIXEL_RATIO)
    expect(cappedPixelRatio(1.5)).toBe(1.5)
    expect(cappedPixelRatio(0.5)).toBe(1)
  })
  it('falls back to 1 for nonsense', () => {
    expect(cappedPixelRatio(0)).toBe(1)
    expect(cappedPixelRatio(NaN)).toBe(1)
    expect(cappedPixelRatio(Infinity)).toBe(1)
  })
})
