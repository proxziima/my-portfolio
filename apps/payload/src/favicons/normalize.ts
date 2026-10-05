import { type RenderCaps, renderInChild } from './render'
import { isBoundedSvg } from './svg-check'

/**
 * A favicon ready to store: its bytes, MIME type and file extension. Always an ICO file kept as it
 * was fetched (`image/x-icon`, `ico`) or a PNG freshly encoded from the fetched image's pixels
 * (`image/png`, `png`), so the CMS origin never serves markup.
 */
export interface FoundFavicon {
  data: Buffer
  mimetype: string
  ext: string
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** The header size a BMP image inside an ICO starts with (BITMAPINFOHEADER). */
const BMP_HEADER = 40

const startsWith = (data: Buffer, magic: number[], at = 0) => magic.every((byte, i) => data[at + i] === byte)
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

const isGzip = (data: Buffer) => startsWith(data, [0x1f, 0x8b])

/**
 * Whether the bytes are a well-formed ICO: the ICONDIR header (reserved 0, type 1, at least one
 * image), and every directory entry's image inside the file, after the directory, starting as a PNG
 * or a BMP info header. Four magic bytes alone would let any body ride along unchanged.
 */
function isIco(data: Buffer): boolean {
  if (data.length < 6 || data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1) return false
  const images = data.readUInt16LE(4)
  const directoryEnd = 6 + 16 * images
  if (images === 0 || data.length < directoryEnd) return false
  for (let entry = 6; entry < directoryEnd; entry += 16) {
    const size = data.readUInt32LE(entry + 8)
    const offset = data.readUInt32LE(entry + 12)
    if (offset < directoryEnd || size < PNG_MAGIC.length || offset + size > data.length) return false
    const bmp = size >= BMP_HEADER && data.readUInt32LE(offset) === BMP_HEADER
    if (!bmp && !startsWith(data, PNG_MAGIC, offset)) return false
  }
  return true
}

/**
 * Whether the bytes open like a raster file sharp reads (PNG, JPEG, GIF, WebP, TIFF, HEIF/AVIF). libvips
 * picks these loaders over its SVG loader, which claims anything else that mentions `<svg` early on.
 */
function isRaster(data: Buffer): boolean {
  return (
    startsWith(data, PNG_MAGIC) ||
    startsWith(data, [0xff, 0xd8, 0xff]) ||
    startsWith(data, ascii('GIF8')) ||
    (startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8)) ||
    startsWith(data, ascii('II*\0')) ||
    startsWith(data, ascii('MM\0*')) ||
    startsWith(data, ascii('ftyp'), 4)
  )
}

/**
 * Turns fetched bytes into the icon to store, by their content alone (a declared type is never
 * trusted):
 * - gzip is refused unparsed (sharp would inflate it as an SVG);
 * - a well-formed ICO is kept as it is (sharp cannot read ICO, and served as an image it runs nothing);
 * - a raster image (PNG, JPEG, GIF, WebP, TIFF, HEIF/AVIF) is decoded, and an SVG that passes the
 *   markup pre-check (svg-check.ts) is drawn, each re-encoded as a fresh 64×64 PNG so no markup or
 *   polyglot bytes survive. That work runs in a child process killed after `caps.timeoutMs`, which
 *   exits itself above `caps.memoryMb` (render.ts);
 * - anything else is refused.
 * Resolves null when nothing usable comes out; never throws.
 */
export async function normalizeIcon(data: Buffer, caps: RenderCaps): Promise<FoundFavicon | null> {
  if (isGzip(data)) return null
  if (isIco(data)) return { data, mimetype: 'image/x-icon', ext: 'ico' }
  const kind = isRaster(data) ? 'raster' : 'svg'
  if (kind === 'svg' && !isBoundedSvg(data)) return null
  const png = await renderInChild(data, kind, caps)
  return png && { data: png, mimetype: 'image/png', ext: 'png' }
}
