/** A favicon ready to store: its bytes, MIME type and file extension. */
export interface FoundFavicon {
  data: Buffer
  mimetype: string
  ext: string
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const TIMEOUT_MS = 5000
const PAGE_LIMIT = 1_000_000
const ICON_LIMIT = 512_000
const USER_AGENT = 'Mozilla/5.0 (compatible; portfolio-favicon/1.0)'

const EXTENSIONS: Record<string, string> = {
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

const isHttp = (url: URL) => url.protocol === 'http:' || url.protocol === 'https:'

/** The body as a Buffer, or null once it passes `limit` bytes (the download is cancelled there). */
async function readCapped(res: Response, limit: number): Promise<Buffer | null> {
  if (Number(res.headers.get('content-length')) > limit) {
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
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/** ICO and PNG files by their magic bytes, for servers that send icons as octet-stream. */
function sniff(data: Buffer): string | undefined {
  if (data.length >= 4 && data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0) return 'image/x-icon'
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return undefined
}

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

/**
 * Icon URLs a page declares (`rel` icon, shortcut icon, apple-touch-icon), best first: `sizes="any"`
 * and SVG count as largest, then the largest declared size, then document order.
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
      url = new URL(href, base)
    } catch {
      continue
    }
    if (!isHttp(url)) continue
    const sizes = (attr(tag, 'sizes') ?? '').toLowerCase()
    const svg = (attr(tag, 'type') ?? '').toLowerCase() === 'image/svg+xml' || url.pathname.toLowerCase().endsWith('.svg')
    const declared = sizes.split(/\s+/).map((s) => Number.parseInt(s, 10)).filter(Number.isFinite)
    const size = sizes === 'any' || svg ? Number.POSITIVE_INFINITY : Math.max(0, ...declared)
    found.push({ href: url.toString(), size, index })
  }
  return found
    .sort((a, b) => (a.size === b.size ? a.index - b.index : b.size > a.size ? 1 : -1))
    .map((c) => c.href)
}

/**
 * Finds a site's icon: the icons its page declares, best first, then `/favicon.ico` at the origin.
 * The first candidate that answers 200 with an image (or ICO/PNG bytes) under 512 KB wins. Every
 * request times out after 5 s. Returns null for non-http(s) URLs or when nothing qualifies; never throws.
 */
export async function discoverFavicon(url: string, fetchImpl: Fetch = fetch): Promise<FoundFavicon | null> {
  let page: URL
  try {
    page = new URL(url)
  } catch {
    return null
  }
  if (!isHttp(page)) return null
  const get = (target: string) =>
    fetchImpl(target, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,image/*;q=0.9,*/*;q=0.5' },
    })

  const candidates: string[] = []
  try {
    const res = await get(page.toString())
    if (res.ok && (res.headers.get('content-type') ?? '').includes('html')) {
      const body = await readCapped(res, PAGE_LIMIT)
      if (body) candidates.push(...iconLinks(body.toString('utf8'), res.url || page.toString()))
    } else {
      await res.body?.cancel()
    }
  } catch {
    // An unreachable page still leaves /favicon.ico to try.
  }
  candidates.push(new URL('/favicon.ico', page.origin).toString())

  for (const candidate of new Set(candidates)) {
    try {
      const res = await get(candidate)
      const declared = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
      if (!res.ok || !(declared.startsWith('image/') || declared === 'application/octet-stream' || declared === '')) {
        await res.body?.cancel()
        continue
      }
      const data = await readCapped(res, ICON_LIMIT)
      if (!data || data.length === 0) continue
      const mimetype = declared.startsWith('image/') ? declared : sniff(data)
      if (!mimetype) continue
      return { data, mimetype, ext: EXTENSIONS[mimetype] ?? mimetype.slice('image/'.length).replace(/[^a-z0-9]/g, '') }
    } catch {
      // Try the next candidate.
    }
  }
  return null
}
