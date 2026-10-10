import type { ImageAsset, ImageVariant } from './types'

/** The `<source type="image/avif">` group, or the `<img>`'s own candidates (WebP, and any source passthrough). */
export type VariantGroup = 'avif' | 'fallback'

const inGroup = (v: ImageVariant, group: VariantGroup) => (v.type === 'image/avif') === (group === 'avif')

const byWidth = (asset: ImageAsset, group: VariantGroup) => asset.variants.filter((v) => inGroup(v, group)).sort((a, b) => a.width - b.width)

/** `src 64w, src 128w`: one group's candidates, for a `sizes`-driven pick. */
export const srcset = (asset: ImageAsset, group: VariantGroup): string =>
  byWidth(asset, group)
    .map((v) => `${v.src} ${v.width}w`)
    .join(', ')

/** The `<img>`'s `src`: its largest candidate, so a browser that ignores `srcset` never shows less. */
export const fallbackSrc = (asset: ImageAsset): string => {
  const last = byWidth(asset, 'fallback').at(-1)
  if (!last) throw new Error('image asset without a fallback variant')
  return last.src
}
