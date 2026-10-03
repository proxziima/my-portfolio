import { describe, expect, it, vi } from 'vitest'
import { applyPixelRatio, MAX_PIXEL_RATIO, scenePixelRatio } from '@/features/figure/scene-pixel-ratio'

describe('scenePixelRatio', () => {
  it('renders the device pixels the scaled stage covers, rounded up to a step', () => {
    expect(scenePixelRatio(3, 0.4)).toBe(1.25)
    expect(scenePixelRatio(2, 0.7)).toBe(1.5)
    expect(scenePixelRatio(2, 0.5)).toBe(1)
  })

  it('caps the ratio on large high-density screens', () => {
    expect(MAX_PIXEL_RATIO).toBe(2)
    expect(scenePixelRatio(3, 1)).toBe(2)
  })

  it('falls back to 1 when the inputs make no ratio', () => {
    expect(scenePixelRatio(2, 0)).toBe(1)
    expect(scenePixelRatio(Number.NaN, 0.5)).toBe(1)
    expect(scenePixelRatio(Number.POSITIVE_INFINITY, 0.5)).toBe(1)
  })
})

describe('applyPixelRatio', () => {
  it('sets the renderer ratio, then forces the runtime resize', () => {
    const setPixelRatio = vi.fn()
    const _resize = vi.fn()
    applyPixelRatio({ _renderer: { setPixelRatio }, _resize } as never, 1.25)
    expect(setPixelRatio).toHaveBeenCalledWith(1.25)
    expect(_resize).toHaveBeenCalledOnce()
    expect(_resize).toHaveBeenCalledWith(true)
    expect(setPixelRatio.mock.invocationCallOrder[0]!).toBeLessThan(_resize.mock.invocationCallOrder[0]!)
  })

  it('does nothing when the runtime internals are missing', () => {
    const setPixelRatio = vi.fn()
    const _resize = vi.fn()
    expect(() => applyPixelRatio({ _resize } as never, 1.25)).not.toThrow()
    expect(() => applyPixelRatio({ _renderer: {}, _resize } as never, 1.25)).not.toThrow()
    expect(() => applyPixelRatio({ _renderer: { setPixelRatio } } as never, 1.25)).not.toThrow()
    expect(setPixelRatio).not.toHaveBeenCalled()
    expect(_resize).not.toHaveBeenCalled()
  })
})
