import { describe, expect, it } from 'vitest'
import { ATLAS, flipDuration, frameAt, frameOrigin, isValidAtlas, smoothstep } from '@/features/theme/rocker-atlas'

describe('rocker atlas', () => {
  it('validates the 5×4 grid of 212×280 frames', () => {
    expect(isValidAtlas(1060, 1120)).toBe(true)
    expect(isValidAtlas(1060, 1000)).toBe(false)
  })
  it('maps progress to frames', () => {
    expect(frameAt(0)).toBe(0)
    expect(frameAt(1)).toBe(ATLAS.frames - 1)
    expect(frameAt(0.5)).toBe(8)
  })
  it('finds frame origins', () => {
    expect(frameOrigin(7)).toEqual({ sx: 2 * 212, sy: 280 })
  })
  it('eases and times flips', () => {
    expect(smoothstep(0.5)).toBe(0.5)
    expect(flipDuration(1, false)).toBe(200)
    expect(flipDuration(1, true)).toBe(115)
  })
})
