import { describe, expect, it } from 'vitest'
import { fallbackFace, formatCorrections, overrides, parseCorrections, pickCorrection, xWidthAvg } from '@/scripts/fonts/fallbacks-core'

const inter = { ascent: 1984, descent: -494, lineGap: 0, unitsPerEm: 2048, xWidthAvg: 1032 }
const arial = { ascent: 1854, descent: -434, lineGap: 67, unitsPerEm: 2048, xWidthAvg: 904 }

describe('fallback overrides', () => {
  it('scales the fallback to the web font width and re-expresses vertical metrics in its em', () => {
    const o = overrides(inter, arial, 1)
    expect(o.sizeAdjust).toBeCloseTo(1032 / 2048 / (904 / 2048), 4)
    expect(o.ascentOverride).toBeCloseTo(1984 / 2048 / o.sizeAdjust, 4)
    expect(o.descentOverride).toBeCloseTo(494 / 2048 / o.sizeAdjust, 4)
    expect(o.lineGapOverride).toBe(0)
  })

  it('applies the measured correction on top of the average-width ratio', () => {
    expect(overrides(inter, arial, 0.98).sizeAdjust).toBeCloseTo(overrides(inter, arial, 1).sizeAdjust * 0.98, 6)
  })

  it('renders one @font-face per local font', () => {
    const css = fallbackFace('Inter Fallback Arial', 'Arial', overrides(inter, arial, 1))
    expect(css).toMatch(/font-family: 'Inter Fallback Arial';/)
    expect(css).toMatch(/src: local\('Arial'\);/)
    expect(css).toMatch(/size-adjust: \d+\.\d+%;/)
  })

  it('lists every local name the platform may match on', () => {
    const css = fallbackFace('Inter Fallback Roboto', ['Roboto', 'Roboto-Regular'], overrides(inter, arial, 1))
    expect(css).toMatch(/src: local\('Roboto'\), local\('Roboto-Regular'\);/)
  })
})

describe('xWidthAvg', () => {
  it('is the frequency-weighted mean advance', () => {
    expect(xWidthAvg(() => 1000)).toBe(1000)
    // the space carries the largest weight, so a wide space pulls the average up the most
    expect(xWidthAvg((c) => (c === ' ' ? 2000 : 1000))).toBeGreaterThan(xWidthAvg((c) => (c === 'e' ? 2000 : 1000)))
  })
})

describe('corrections header', () => {
  it('round-trips the per-face corrections', () => {
    const header = formatCorrections({ segoeUI: 1.0125, arial: 0.99 })
    expect(header).toBe('/* corrections: segoeUI=1.0125 arial=0.9900 */')
    expect(parseCorrections(`/* generated */\n${header}\n@font-face {}`)).toEqual({ segoeUI: 1.0125, arial: 0.99 })
  })

  it('is empty when the file has none', () => {
    expect(parseCorrections('')).toEqual({})
  })
})

describe('pickCorrection', () => {
  const c = (mismatches: number, error = 0, breaks = 0) => ({ mismatches, breaks, error })

  it('takes the middle of the widest run that keeps every height', () => {
    expect(pickCorrection([c(2), c(0, 0.01), c(1), c(0, 0.05), c(0, 0.02), c(0, 0.04), c(3)])).toEqual({ index: 4, window: [3, 5] })
  })

  it('prefers, inside that run, the fewest changed line breaks', () => {
    expect(pickCorrection([c(1), c(0, 0, 2), c(0, 0, 1), c(0, 0, 0), c(0, 0, 0), c(1)])).toEqual({ index: 3, window: [1, 4] })
  })

  it('falls back to the fewest mismatches, then line breaks, then the smallest error', () => {
    expect(pickCorrection([c(3, 0), c(1, 0.04), c(1, 0.02), c(2, 0.01)])).toEqual({ index: 2 })
    expect(pickCorrection([c(1, 0.01, 3), c(1, 0.04, 1), c(2, 0, 0)])).toEqual({ index: 1 })
  })
})
