import type { TextureFormat } from '@/lib/assets/texture-format'
import type { DeskAsset } from './config'

/**
 * The desk's files with the texture format chosen: plain URLs for the loaders. No loader here: the
 * main thread imports this table's types without pulling three's loaders along.
 */
export type DeskAssetUrls = ReadonlyArray<{ model: string; texture: string; drop?: readonly string[] }>

/**
 * Each asset's texture in `format`: the AVIF where there is one and the decoding context decodes
 * AVIF, else the WebP. Called where the textures are decoded (the worker, or the main thread when it
 * draws), with that context's own `textureFormat()`.
 */
export const deskAssetUrls = (assets: readonly DeskAsset[], format: TextureFormat): DeskAssetUrls =>
  assets.map((asset) => ({ model: asset.model, texture: (format === 'avif' && asset.texture.avif) || asset.texture.webp, drop: asset.drop }))
