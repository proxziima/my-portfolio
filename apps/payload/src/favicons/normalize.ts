import sharp, { type Metadata } from 'sharp'

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

/** The stored PNG's edge in pixels. */
const SIZE = 64
/** The longest side, in pixels, an SVG is drawn at before it is scaled down to SIZE. */
const RENDER_SIZE = 256
/** Used when an SVG declares no size of its own. */
const FALLBACK_DENSITY = 384
/** Images larger than this (width × height, an SVG at its render density) are refused, not decoded. */
const MAX_PIXELS = 4096 * 4096
/** SVG limits, checked on the markup before any parser sees it. */
const MAX_ELEMENTS = 5000
/** Worst-case elements an SVG may instantiate through nested `<use>`s; see isBoundedSvg. */
const MAX_INSTANCES = 100_000
const MAX_INLINE_IMAGES = 10

/** What sharp may read a raster file as, by the format it reports. */
const RASTER_FORMATS = new Set(['png', 'jpeg', 'gif', 'webp', 'heif', 'tiff'])
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

const startsWith = (data: Buffer, magic: number[], at = 0) => magic.every((byte, i) => data[at + i] === byte)
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

const isGzip = (data: Buffer) => startsWith(data, [0x1f, 0x8b])
const isIco = (data: Buffer) => startsWith(data, [0, 0, 1, 0])

/**
 * Whether the bytes open like a raster file sharp reads (PNG, JPEG, GIF, WebP, TIFF, HEIF/AVIF). libvips
 * picks these loaders over its SVG loader, which claims anything else that mentions `<svg` early on.
 */
function isRaster(data: Buffer): boolean {
  return (
    startsWith(data, [0x89, ...ascii('PNG\r\n\x1a\n')]) ||
    startsWith(data, [0xff, 0xd8, 0xff]) ||
    startsWith(data, ascii('GIF8')) ||
    (startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8)) ||
    startsWith(data, ascii('II*\0')) ||
    startsWith(data, ascii('MM\0*')) ||
    startsWith(data, ascii('ftyp'), 4)
  )
}

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0

const codePoint = (n: number) => (n <= 0x10ffff ? String.fromCodePoint(n) : '�')

/**
 * The markup as a URL parser ends up reading it: XML character references, then CSS escapes decoded
 * (an attribute such as `style` gets both, in that order), and tabs and newlines dropped, which URL
 * parsing ignores. Decoding where neither applies only adds matches, so checks on this stay conservative.
 */
function asUrlsRead(markup: string): string {
  return markup
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (_, hex?: string, dec?: string) =>
      codePoint(hex ? Number.parseInt(hex, 16) : Number(dec)),
    )
    .replace(/\\(?:([0-9a-f]{1,6})[ \t\r\n\f]?|([^0-9a-f\r\n\f]))/gi, (_, hex?: string, char?: string) =>
      hex ? codePoint(Number.parseInt(hex, 16)) : char!,
    )
    .replace(/[\t\n\r]/g, '')
}

/**
 * Whether every inline `data:` URL in the markup is a base64 PNG, JPEG, GIF or WebP that is one, with
 * all of them together under the pixel cap. librsvg loads `data:` URLs, so anything else could pull in
 * a nested document (an SVG or a stylesheet, gzip-compressed or not) that none of these checks reads.
 */
async function inlineImagesAreBounded(urls: string): Promise<boolean> {
  const dataUrls = [...urls.matchAll(/data:/gi)]
  if (dataUrls.length > MAX_INLINE_IMAGES) return false
  let pixels = 0
  for (const { index } of dataUrls) {
    const image = /data:image\/(?:png|jpeg|gif|webp);base64,([A-Za-z0-9+/=%\s]*)/iy
    image.lastIndex = index
    const payload = image.exec(urls)?.[1]
    if (payload === undefined) return false
    const base64 = payload.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    const bytes = Buffer.from(base64.replace(/\s/g, ''), 'base64')
    if (!isRaster(bytes)) return false
    const { format, width = 0, height = 0 } = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata()
    pixels += width * height
    if (!RASTER_FORMATS.has(format) || pixels > MAX_PIXELS) return false
  }
  return true
}

/**
 * The cheap structural check an SVG must pass before sharp parses it (parsing alone runs XIncludes):
 * - readable as ASCII-compatible text, so the counts below see its markup: no NUL bytes (UTF-16/32)
 *   and no declared encoding other than UTF-8, ASCII or ISO-8859-x;
 * - no entity declarations, no XInclude;
 * - at most MAX_ELEMENTS elements, and at most MAX_INSTANCES worst-case `<use>` instances: with
 *   `uses` references, nesting can multiply copies by at most 3^(uses/3), so a 1 KB fan-out that
 *   librsvg spends seconds on is refused while a handful of plain `<use>`s is fine;
 * - inline `data:` URLs only for small raster images (see inlineImagesAreBounded).
 * Element names are matched with any namespace prefix. External references need no check: the SVG
 * is read from a Buffer, without a base URL, so librsvg loads no http(s), file: or relative URL.
 */
async function isBoundedSvg(data: Buffer): Promise<boolean> {
  if (data.includes(0)) return false
  const markup = data.toString('latin1')
  const encoding = /^(?:\xef\xbb\xbf)?<\?xml[^>]*?\bencoding\s*=\s*["']([^"']*)/.exec(markup)?.[1]
  if (encoding !== undefined && !/^(?:utf-?8|(?:us-)?ascii|iso-8859-\d+|latin-?1)$/i.test(encoding)) return false
  if (/<!ENTITY/i.test(markup)) return false
  const elements = count(markup, /<[A-Za-z_:\x80-\xff]/g)
  const uses = count(markup, /<(?:[^\s<>/!?:]+:)?use[\s/>]/g)
  if (elements > MAX_ELEMENTS || elements * 3 ** (uses / 3) > MAX_INSTANCES) return false
  const urls = asUrlsRead(markup)
  if (/xinclude/i.test(urls)) return false
  return inlineImagesAreBounded(urls)
}

/** The density (dpi) that draws an SVG at about RENDER_SIZE px on its longest side; sharp reports SVG sizes at 72 dpi. */
function densityFor({ width, height }: Metadata): number {
  const longest = Math.max(width ?? 0, height ?? 0)
  return longest ? Math.max(1, (72 * RENDER_SIZE) / longest) : FALLBACK_DENSITY
}

/** The bytes drawn or decoded as a 64×64 PNG (aspect kept, padded with transparency), or null. */
async function toPng(data: Buffer): Promise<Buffer | null> {
  const raster = isRaster(data)
  if (!raster && !(await isBoundedSvg(data))) return null
  const meta = await sharp(data, { limitInputPixels: MAX_PIXELS }).metadata()
  if (raster ? !RASTER_FORMATS.has(meta.format) : meta.format !== 'svg') return null
  // Animated input keeps only its first frame (sharp's default).
  const image = raster
    ? sharp(data, { limitInputPixels: MAX_PIXELS })
    : sharp(data, { density: densityFor(meta), limitInputPixels: MAX_PIXELS })
  return image.resize(SIZE, SIZE, { fit: 'contain', background: TRANSPARENT }).png().toBuffer()
}

/** `work`'s result, or null once `ms` have passed first. */
async function withinBudget<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(resolve, Math.max(0, ms), null)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Turns fetched bytes into the icon to store, by their content alone (a declared type is never
 * trusted): gzip is refused unparsed, since sharp would inflate it as an SVG; an ICO is kept as it is
 * (sharp cannot read ICO, and served as an image an ICO runs nothing); a raster image (PNG, JPEG, GIF,
 * WebP, TIFF, HEIF/AVIF) is decoded and an SVG passing isBoundedSvg is drawn, each re-encoded as a
 * fresh 64×64 PNG, so no markup or polyglot bytes survive; anything else is refused.
 *
 * Decoding and drawing give up after `budgetMs` and resolve null. libvips cannot be cancelled, so the
 * abandoned work finishes on a libuv worker thread in the background; the pre-checks and the pixel cap
 * bound it, along with librsvg's own limit of 500k instanced elements. Never throws.
 */
export async function normalizeIcon(data: Buffer, budgetMs: number): Promise<FoundFavicon | null> {
  if (isGzip(data)) return null
  if (isIco(data)) return { data, mimetype: 'image/x-icon', ext: 'ico' }
  try {
    const png = await withinBudget(toPng(data), budgetMs)
    return png && { data: png, mimetype: 'image/png', ext: 'png' }
  } catch {
    return null
  }
}
