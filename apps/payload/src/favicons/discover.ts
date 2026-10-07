import { type FoundFavicon, normalizeIcon } from './normalize'

export type { FoundFavicon }

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Budgets: time in milliseconds for each request, for decoding or drawing each fetched image (in
 * its own process), and for the whole discovery; and that process's resident memory in MB.
 */
export interface Limits {
  requestTimeoutMs: number
  renderTimeoutMs: number
  renderMemoryMb: number
  totalTimeoutMs: number
}

export const DEFAULT_LIMITS: Limits = {
  requestTimeoutMs: 5000,
  renderTimeoutMs: 3000,
  renderMemoryMb: 256,
  totalTimeoutMs: 15_000,
}

const PAGE_LIMIT = 1_000_000
const ICON_LIMIT = 512_000
/** Declared icons to try, best first; `/favicon.ico` is always tried on top of these. */
const MAX_DECLARED = 4
const USER_AGENT = 'Mozilla/5.0 (compatible; portfolio-favicon/1.0)'

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
 * origin the page ended up on. The first candidate that answers 200 with an image (or untyped) body
 * of at most 512 KB, which normalizeIcon accepts, wins: an ICO as it is, any other image as a 64×64
 * PNG re-encoded from its pixels. The content decides; the declared type only filters out pages.
 *
 * Bounds, by default (see `limits`): each request 5 s; decoding or drawing each image 3 s and 256 MB,
 * in a child process that is killed at either; the whole search 15 s, which also cuts short a
 * request or a drawing in progress. The page is read up to 1 MB, each icon up to 512 KB. Returns
 * null for non-http(s) URLs or when nothing qualifies; never throws.
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
  const endsAt = Date.now() + limits.totalTimeoutMs
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
      const timeoutMs = Math.min(limits.renderTimeoutMs, endsAt - Date.now())
      if (timeoutMs <= 0) break
      const icon = await normalizeIcon(data, { timeoutMs, memoryMb: limits.renderMemoryMb })
      if (icon) return icon
    } catch {
      // Try the next candidate.
    }
  }
  return null
}
