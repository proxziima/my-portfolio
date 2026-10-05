import { rasterizeSvg } from './rasterize'

/** A favicon ready to store: its bytes, MIME type and file extension. */
export interface FoundFavicon {
  data: Buffer
  mimetype: string
  ext: string
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** Time budgets in milliseconds: one per request, and one for the whole discovery. */
export interface Limits {
  requestTimeoutMs: number
  totalTimeoutMs: number
}

export const DEFAULT_LIMITS: Limits = { requestTimeoutMs: 5000, totalTimeoutMs: 15_000 }

const PAGE_LIMIT = 1_000_000
const ICON_LIMIT = 512_000
/** Declared icons to try, best first; `/favicon.ico` is always tried on top of these. */
const MAX_DECLARED = 4
const USER_AGENT = 'Mozilla/5.0 (compatible; portfolio-favicon/1.0)'

/**
 * The types stored as they are: raster only. An SVG stored on the CMS origin could run script when
 * opened directly, so SVG icons are rasterized to PNG instead (see rasterize.ts).
 */
const EXTENSIONS: Record<string, string> = {
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

const isHttp = (url: URL) => url.protocol === 'http:' || url.protocol === 'https:'

/**
 * The body as a Buffer, reading at most `limit` bytes and cancelling the rest. When the body is
 * longer, `truncate` keeps the first `limit` bytes; otherwise the body is rejected with null.
 */
async function readCapped(res: Response, limit: number, { truncate = false } = {}): Promise<Buffer | null> {
  if (!truncate && Number(res.headers.get('content-length')) > limit) {
    await res.body?.cancel()
    return null
  }
  const reader = res.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    chunks.push(value)
    if (size > limit) {
      await reader.cancel()
      return truncate ? Buffer.concat(chunks).subarray(0, limit) : null
    }
  }
  return Buffer.concat(chunks)
}

/** ICO and PNG files by their magic bytes, which win over whatever the server declared. */
function sniff(data: Buffer): string | undefined {
  if (data.length >= 4 && data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0) return 'image/x-icon'
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return undefined
}

/**
 * The body as SVG markup, whatever the server declared: `<svg …`, or an XML prolog followed by an
 * `<svg` root, after leading whitespace (which an XML prolog may not follow, so it is dropped).
 */
function svgMarkup(data: Buffer): Buffer | null {
  const text = data.toString('utf8').trimStart()
  const lower = text.toLowerCase()
  return (lower.startsWith('<svg') || lower.startsWith('<?xml')) && lower.includes('<svg') ? Buffer.from(text, 'utf8') : null
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&#38;': '&', '&quot;': '"', '&#34;': '"' }
const decodeEntities = (value: string) => value.replace(/&amp;|&#38;|&quot;|&#34;/g, (e) => ENTITIES[e]!)

/** An attribute's raw value in one tag; the lookbehind keeps `data-href` from matching `href`. */
const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`(?<![\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

/**
 * Icon URLs a page declares (`rel` icon, shortcut icon, apple-touch-icon), best first: SVG icons (by
 * type or extension) and `sizes="any"` count as largest since they scale, then the largest declared
 * size, then document order.
 */
export function iconLinks(html: string, base: string): string[] {
  const found: { href: string; size: number; index: number }[] = []
  for (const [index, match] of [...html.matchAll(/<link\b[^>]*>/gi)].entries()) {
    const tag = match[0]
    const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue
    const href = attr(tag, 'href')
    if (!href) continue
    let url: URL
    try {
      url = new URL(decodeEntities(href), base)
    } catch {
      continue
    }
    if (!isHttp(url)) continue
    const svg = (attr(tag, 'type') ?? '').toLowerCase() === 'image/svg+xml' || url.pathname.toLowerCase().endsWith('.svg')
    const sizes = (attr(tag, 'sizes') ?? '').toLowerCase()
    const declared = sizes.split(/\s+/).map((s) => Number.parseInt(s, 10)).filter(Number.isFinite)
    const size = svg || sizes === 'any' ? Number.POSITIVE_INFINITY : Math.max(0, ...declared)
    found.push({ href: url.toString(), size, index })
  }
  return found
    .sort((a, b) => (a.size === b.size ? a.index - b.index : b.size > a.size ? 1 : -1))
    .map((c) => c.href)
}

/**
 * Finds a site's icon: up to four icons its page declares, best first, then `/favicon.ico` at the
 * origin the page ended up on. The first candidate that answers 200 with an image under 512 KB
 * wins: a raster one as it is, its type from the ICO/PNG magic bytes, else from the declared type;
 * an SVG one (declared or sniffed) rasterized to a 64×64 PNG, skipped if it will not render. Each
 * request times out after 5 s and the whole search after 15 s. Returns null for non-http(s) URLs
 * or when nothing qualifies; never throws.
 */
export async function discoverFavicon(
  url: string,
  fetchImpl: Fetch = fetch,
  limits: Limits = DEFAULT_LIMITS,
): Promise<FoundFavicon | null> {
  let page: URL
  try {
    page = new URL(url)
  } catch {
    return null
  }
  if (!isHttp(page)) return null
  const deadline = AbortSignal.timeout(limits.totalTimeoutMs)
  const get = (target: string) =>
    fetchImpl(target, {
      signal: AbortSignal.any([deadline, AbortSignal.timeout(limits.requestTimeoutMs)]),
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,image/*;q=0.9,*/*;q=0.5' },
    })

  const candidates: string[] = []
  let origin = page.origin
  try {
    const res = await get(page.toString())
    if (res.ok && (res.headers.get('content-type') ?? '').toLowerCase().includes('html')) {
      const finalUrl = res.url || page.toString()
      origin = new URL(finalUrl).origin
      const body = await readCapped(res, PAGE_LIMIT, { truncate: true })
      if (body) candidates.push(...iconLinks(body.toString('utf8'), finalUrl).slice(0, MAX_DECLARED))
    } else {
      await res.body?.cancel()
    }
  } catch {
    // An unreachable page still leaves /favicon.ico to try.
  }
  candidates.push(new URL('/favicon.ico', origin).toString())

  for (const candidate of new Set(candidates)) {
    if (deadline.aborted) break
    try {
      const res = await get(candidate)
      const declared = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
      if (!res.ok || !(declared.startsWith('image/') || declared === 'application/octet-stream' || declared === '')) {
        await res.body?.cancel()
        continue
      }
      const data = await readCapped(res, ICON_LIMIT)
      if (!data || data.length === 0) continue
      const sniffed = sniff(data)
      const svg = sniffed ? null : (svgMarkup(data) ?? (declared === 'image/svg+xml' ? data : null))
      if (svg) {
        const png = await rasterizeSvg(svg)
        if (png) return { data: png, mimetype: 'image/png', ext: 'png' }
        continue
      }
      const mimetype = sniffed ?? declared
      const ext = EXTENSIONS[mimetype]
      if (ext) return { data, mimetype, ext }
    } catch {
      // Try the next candidate.
    }
  }
  return null
}
