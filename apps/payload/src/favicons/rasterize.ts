import sharp from 'sharp'

/** The stored icon's edge in pixels. */
const SIZE = 64
/** The longest side, in pixels, an SVG is drawn at before it is scaled down to SIZE. */
const RENDER_SIZE = 256
/** Used when the SVG declares no size of its own. */
const FALLBACK_DENSITY = 384
/** Renders larger than this (width × height at the render density) are refused rather than drawn. */
const MAX_INPUT_PIXELS = 4096 * 4096

/**
 * The density (dpi) that draws the SVG at about RENDER_SIZE px on its longest side, whatever size it
 * declares: sharp reports an SVG's width/height at 72 dpi.
 */
async function densityFor(data: Buffer): Promise<number> {
  const { width, height } = await sharp(data).metadata()
  const longest = Math.max(width ?? 0, height ?? 0)
  if (!longest) return FALLBACK_DENSITY
  return Math.min(2400, Math.max(1, (72 * RENDER_SIZE) / longest))
}

/**
 * Draws an SVG icon as a 64×64 PNG (aspect kept, padded with transparency), so the CMS only ever
 * stores and serves pixels: a third-party SVG on the CMS origin could run script if opened directly.
 * Rendering is done by librsvg inside sharp. The input is a Buffer, so there is no base path: librsvg
 * then loads no external reference at all (http(s), file: or relative `<image>`/`@import`); only
 * inline `data:` URLs render. Returns null when the bytes are not a renderable SVG or exceed the cap.
 */
export async function rasterizeSvg(data: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(data, { density: await densityFor(data), limitInputPixels: MAX_INPUT_PIXELS })
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  } catch {
    return null
  }
}
