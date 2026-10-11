import { describe, expect, it } from 'vitest'
import { fallbackSrc, srcset } from '@/lib/assets/srcset'
import type { ImageAsset } from '@/lib/assets/types'

const asset: ImageAsset = {
  width: 530,
  height: 700,
  variants: [
    { src: '/assets/r.64w.a.avif', width: 64, height: 85, type: 'image/avif' },
    { src: '/assets/r.128w.b.avif', width: 128, height: 169, type: 'image/avif' },
    { src: '/assets/r.64w.c.webp', width: 64, height: 85, type: 'image/webp' },
    { src: '/assets/r.128w.d.webp', width: 128, height: 169, type: 'image/webp' },
  ],
}

describe('srcset', () => {
  it('lists one group with width descriptors', () => {
    expect(srcset(asset, 'avif')).toBe('/assets/r.64w.a.avif 64w, /assets/r.128w.b.avif 128w')
    expect(srcset(asset, 'fallback')).toBe('/assets/r.64w.c.webp 64w, /assets/r.128w.d.webp 128w')
  })

  it('puts source passthroughs (JPEG/PNG) in the fallback group', () => {
    const mixed: ImageAsset = { ...asset, variants: [...asset.variants.slice(0, 3), { src: '/assets/r.e.png', width: 530, height: 700, type: 'image/png' }] }
    expect(srcset(mixed, 'fallback')).toBe('/assets/r.64w.c.webp 64w, /assets/r.e.png 530w')
  })

  it('is empty for a group with no variants', () => {
    expect(srcset({ ...asset, variants: asset.variants.slice(2) }, 'avif')).toBe('')
  })
})

describe('fallbackSrc', () => {
  it('is the largest fallback variant', () => {
    expect(fallbackSrc(asset)).toBe('/assets/r.128w.d.webp')
  })
})
