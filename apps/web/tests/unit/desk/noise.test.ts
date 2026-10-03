// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { noiseDataUrl } from '@/features/desk/noise'

/** Just enough of a 2D context for the generator, keeping the pixels it writes. */
function stubContext() {
  const written: Uint8ClampedArray[] = []
  const ctx = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (image: { data: Uint8ClampedArray }) => { written.push(image.data) },
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
  return (i: number) => {
    const data = written[i]
    if (!data) throw new Error(`no pixels written for call ${i}`)
    return Array.from(data)
  }
}

describe('noiseDataUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is null without canvas 2D', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(noiseDataUrl()).toBeNull()
  })

  it('writes opaque grey pixels and returns the PNG', () => {
    const pixels = stubContext()
    const size = 16
    expect(noiseDataUrl(size)).toBe('data:image/png;base64,AAAA')
    const data = pixels(0)
    expect(data).toHaveLength(size * size * 4)
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i + 3]).toBe(255)
      expect(data[i + 1]).toBe(data[i])
      expect(data[i + 2]).toBe(data[i])
    }
    // noise, not a flat fill
    expect(new Set(data.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(50)
  })

  it('is deterministic for a seed', () => {
    const pixels = stubContext()
    noiseDataUrl(8, 3)
    noiseDataUrl(8, 3)
    noiseDataUrl(8, 4)
    expect(pixels(1)).toEqual(pixels(0))
    expect(pixels(2)).not.toEqual(pixels(0))
  })
})
