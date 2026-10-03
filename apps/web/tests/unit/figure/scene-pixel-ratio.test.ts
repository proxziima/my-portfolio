import { describe, expect, it, vi } from 'vitest'
import { applyPixelRatio, MAX_PIXEL_RATIO, scenePixelRatio } from '@/features/figure/scene-pixel-ratio'

describe('scenePixelRatio', () => {
  it('renders the device pixels the scaled stage covers', () => {
    expect(scenePixelRatio(3, 0.4)).toBeCloseTo(1.2)
    expect(scenePixelRatio(2, 0.7)).toBeCloseTo(1.4)
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
  it('sets the renderer ratio and asks for a frame', () => {
    const setPixelRatio = vi.fn()
    const requestRender = vi.fn()
    applyPixelRatio({ _renderer: { setPixelRatio }, requestRender } as never, 1.2)
    expect(setPixelRatio).toHaveBeenCalledWith(1.2)
    expect(requestRender).toHaveBeenCalledOnce()
  })

  it('does nothing when the runtime internals are missing', () => {
    const requestRender = vi.fn()
    expect(() => applyPixelRatio({ requestRender } as never, 1.2)).not.toThrow()
    expect(() => applyPixelRatio({ _renderer: {}, requestRender } as never, 1.2)).not.toThrow()
    expect(requestRender).not.toHaveBeenCalled()
  })
})
