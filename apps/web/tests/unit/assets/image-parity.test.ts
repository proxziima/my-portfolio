import { describe, expect, it } from 'vitest'
import { composite, onSolid, ssim, VEIL, type RawImage } from '@/scripts/assets/parity/image'

/** A deterministic RGBA image: a gradient with some structure, so SSIM has something to judge. */
function pattern(width: number, height: number, alpha = 255): RawImage {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = (x * 7 + y * 3) % 256
      data[i + 1] = (x * 2 + ((y * 5) ^ x)) % 256
      data[i + 2] = Math.round(128 + 100 * Math.sin(x / 5) * Math.cos(y / 7))
      data[i + 3] = alpha
    }
  return { data, width, height }
}

/** Seeded noise (mulberry32), so the test never flakes. */
function noise(width: number, height: number): RawImage {
  let s = 42
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : Math.floor(rand() * 256)
  return { data, width, height }
}

const solid = (width: number, height: number, rgb: [number, number, number], alpha = 255): RawImage => {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, alpha], i)
  return { data, width, height }
}

describe('ssim', () => {
  it('is 1 for identical images', () => {
    const x = pattern(64, 48)
    expect(ssim(x, x)).toBe(1)
  })

  it('is low against noise', () => {
    expect(ssim(pattern(64, 48), noise(64, 48))).toBeLessThan(0.5)
  })

  it('drops as the error grows', () => {
    const x = pattern(64, 48)
    const shift = (d: number): RawImage => ({ ...x, data: x.data.map((v, i) => (i % 4 === 3 ? v : Math.min(255, v + ((i * 31) % d)))) })
    const small = ssim(x, shift(4))
    const large = ssim(x, shift(40))
    expect(small).toBeLessThan(1)
    expect(large).toBeLessThan(small)
  })

  it('rejects images of different sizes', () => {
    expect(() => ssim(pattern(8, 8), pattern(9, 8))).toThrow(/size/)
  })
})

describe('composite', () => {
  it('plus-lighter: a black layer at any opacity leaves the veiled screen (under × 0.86)', () => {
    const under = pattern(16, 16)
    for (const opacity of [0.12, 0.5, 1]) {
      const out = composite(solid(16, 16, [0, 0, 0]), under, 'plus-lighter', opacity)
      for (let i = 0; i < out.data.length; i++) expect(out.data[i]).toBe(i % 4 === 3 ? 255 : Math.round(under.data[i]! * (1 - VEIL)))
    }
  })

  it('plus-lighter adds the layer at its opacity and clips at white', () => {
    const out = composite(solid(2, 2, [100, 255, 0]), solid(2, 2, [255, 100, 50]), 'plus-lighter', 0.5)
    expect([...out.data.slice(0, 4)]).toEqual([255, Math.round(100 * 0.86 + 127.5), Math.round(50 * 0.86), 255])
  })

  it('normal: alpha-over at the layer alpha times the opacity', () => {
    const out = composite(solid(2, 2, [200, 0, 0], 128), solid(2, 2, [0, 0, 100]), 'normal', 1)
    const a = 128 / 255
    expect([...out.data.slice(0, 4)]).toEqual([Math.round(200 * a), 0, Math.round(100 * (1 - a)), 255])
  })

  it('onSolid flattens transparency over a colour', () => {
    const out = onSolid(solid(2, 2, [255, 255, 255], 0), [0, 0, 0])
    expect([...out.data.slice(0, 4)]).toEqual([0, 0, 0, 255])
  })
})
