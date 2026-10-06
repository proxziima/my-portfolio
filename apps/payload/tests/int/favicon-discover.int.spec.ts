// @vitest-environment node
import { gzipSync } from 'node:zlib'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIMITS, discoverFavicon, iconLinks } from '@/favicons/discover'

const PNG_MAGIC = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const solid = (background: string) => sharp({ create: { width: 16, height: 16, channels: 4, background } })
const PNG = new Uint8Array(await solid('#f00').png().toBuffer())
const PNG_BLUE = new Uint8Array(await solid('#00f').png().toBuffer())
const JPEG = new Uint8Array(await solid('#f00').jpeg().toBuffer())
/** A one-image ICO: the ICONDIR header, one 16-byte entry, then the PNG it points at. */
const ICO = new Uint8Array(
  Buffer.concat([
    Buffer.from([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0]),
    Buffer.from(Uint32Array.of(PNG.length, 22).buffer),
    PNG,
  ]),
)
const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>'
const SVG = new TextEncoder().encode(SVG_TEXT)
/** Enough translucent shapes to take a few hundred milliseconds to draw, within every structural limit. */
const SLOW_SVG = new TextEncoder().encode(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">${'<circle cx="8" cy="8" r="8" fill="red" opacity="0.5"/>'.repeat(4900)}</svg>`,
)

const html = (head: string) => new Response(`<html><head>${head}</head></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
const image = (bytes: Uint8Array, type: string) => new Response(bytes, { headers: { 'content-type': type } })
const notFound = () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })

/** Asserts the stored icon is a freshly encoded 64×64 PNG; resolves to its top-left pixel (RGBA). */
async function expectPng(found: Awaited<ReturnType<typeof discoverFavicon>>) {
  expect(found).toMatchObject({ mimetype: 'image/png', ext: 'png' })
  expect(found!.data.subarray(0, 8).equals(Buffer.from(PNG_MAGIC))).toBe(true)
  expect(await sharp(found!.data).metadata()).toMatchObject({ format: 'png', width: 64, height: 64 })
  const { data } = await sharp(found!.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return [...data.subarray(0, 4)]
}

/** A fetch stub answering from a url → response factory table; anything else 404s. */
const stub = (routes: Record<string, () => Response>) =>
  vi.fn(async (input: string | URL | Request) => (routes[String(input)] ?? notFound)())

describe('iconLinks', () => {
  it('ranks declared icons by size, any first, and resolves relative hrefs', () => {
    const page = `
      <link rel="icon" href="/small.png" sizes="16x16">
      <link rel="apple-touch-icon" href="touch.png" sizes="180x180">
      <link rel="stylesheet" href="/x.css">
      <link rel="shortcut icon" href="/legacy.ico">
      <link href='/any.png' rel='icon' sizes='any'>`
    expect(iconLinks(page, 'https://a.dev/en/')).toEqual([
      'https://a.dev/any.png',
      'https://a.dev/en/touch.png',
      'https://a.dev/small.png',
      'https://a.dev/legacy.ico',
    ])
  })
  it('ranks SVG icons, by type or by extension, with sizes="any" as largest', () => {
    const page = `
      <link rel="icon" href="/big.png" sizes="512x512">
      <link rel="icon" href="/vector" type="image/svg+xml" sizes="32x32">
      <link rel="icon" href="/any.png" sizes="any">
      <link rel="icon" href="/other.SVG">`
    expect(iconLinks(page, 'https://a.dev/')).toEqual([
      'https://a.dev/vector',
      'https://a.dev/any.png',
      'https://a.dev/other.SVG',
      'https://a.dev/big.png',
    ])
  })
  it('ignores non-http hrefs', () => {
    expect(iconLinks('<link rel="icon" href="data:image/png;base64,AAAA">', 'https://a.dev/')).toEqual([])
  })
  it('does not mistake data-href or data-rel for the real attributes', () => {
    const page = '<link data-rel="icon" rel="preload" href="/a.png"><link rel="icon" data-href="/x.png" href="/b.png">'
    expect(iconLinks(page, 'https://a.dev/')).toEqual(['https://a.dev/b.png'])
  })
  it('decodes HTML entities in hrefs before resolving', () => {
    const page = '<link rel="icon" href="/i.png?a=1&amp;b=2&#38;c=3">'
    expect(iconLinks(page, 'https://a.dev/')).toEqual(['https://a.dev/i.png?a=1&b=2&c=3'])
  })
})

// Real render processes: each discovery is bounded by its total budget; allow twice that on a loaded machine.
describe('discoverFavicon', { timeout: 2 * DEFAULT_LIMITS.totalTimeoutMs }, () => {
  it('returns the best declared icon', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/icon.png" sizes="32x32">'),
      'https://a.dev/icon.png': () => image(PNG, 'image/png'),
    })
    expect(await expectPng(await discoverFavicon('https://a.dev/', fetchImpl))).toEqual([255, 0, 0, 255])
  })
  it('fetches the largest declared icon first', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () =>
        html('<link rel="icon" href="/s.png" sizes="16x16"><link rel="icon" href="/b.png" sizes="64x64">'),
      'https://a.dev/s.png': () => image(PNG, 'image/png'),
      'https://a.dev/b.png': () => image(PNG_BLUE, 'image/png'),
    })
    const found = await discoverFavicon('https://a.dev/', fetchImpl)
    expect(fetchImpl.mock.calls[1]![0]).toBe('https://a.dev/b.png')
    expect(await expectPng(found)).toEqual([0, 0, 255, 255])
  })
  it('falls back to /favicon.ico at the origin', async () => {
    const fetchImpl = stub({
      'https://a.dev/team': () => html(''),
      'https://a.dev/favicon.ico': () => image(ICO, 'image/x-icon'),
    })
    expect(await discoverFavicon('https://a.dev/team', fetchImpl)).toMatchObject({ mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('still tries /favicon.ico when the page itself cannot be fetched', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === 'https://a.dev/') throw new Error('ECONNRESET')
      return image(ICO, 'image/x-icon')
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ ext: 'ico' })
  })
  it('falls back to the origin of the final page URL after a redirect', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () => Object.defineProperty(html(''), 'url', { value: 'https://b.dev/home' }),
      'https://b.dev/favicon.ico': () => image(ICO, 'image/x-icon'),
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ ext: 'ico' })
  })
  it('reads the content type of the page case-insensitively', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () =>
        new Response('<link rel="icon" href="/i.png">', { headers: { 'content-type': 'Text/HTML' } }),
      'https://a.dev/i.png': () => image(PNG, 'image/png'),
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ ext: 'png' })
  })
  it('parses the head of a page larger than 1 MB', async () => {
    const huge = `<link rel="icon" href="/i.png">${'x'.repeat(1_200_000)}`
    const fetchImpl = stub({
      'https://a.dev/': () => new Response(huge, { headers: { 'content-type': 'text/html' } }),
      'https://a.dev/i.png': () => image(PNG, 'image/png'),
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ ext: 'png' })
  })
  it('sniffs icons served as application/octet-stream', async () => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(ICO, 'application/octet-stream') })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('rejects octet-stream bytes that are neither ICO nor PNG', async () => {
    const junk = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(junk, 'application/octet-stream') })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
  })
  it('stores a PNG declared as a JPEG as a re-encoded PNG', async () => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(PNG, 'image/jpeg') })
    expect(await expectPng(await discoverFavicon('https://a.dev/', fetchImpl))).toEqual([255, 0, 0, 255])
  })
  it('stores a JPEG as a PNG', async () => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(JPEG, 'image/jpeg') })
    await expectPng(await discoverFavicon('https://a.dev/', fetchImpl))
  })
  it.each([
    ['a comment', 'image/png', `<!-- logo -->\n${SVG_TEXT}`],
    ['a DOCTYPE', 'image/jpeg', `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${SVG_TEXT}`],
  ])('stores an SVG that starts with %s, declared %s, as a drawn PNG', async (_, type, body) => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(new TextEncoder().encode(body), type) })
    const found = await discoverFavicon('https://a.dev/', fetchImpl)
    expect(await expectPng(found)).toEqual([0, 0, 255, 255])
    expect(found!.data.toString('latin1')).not.toContain('<svg')
  })
  it('rejects an HTML body declared as a PNG', async () => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(new TextEncoder().encode('<!doctype html><p>hi'), 'image/png') })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
  })
  it('rejects a gzip-compressed SVG quickly', async () => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(gzipSync(SVG), 'image/svg+xml') })
    const started = Date.now()
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
    expect(Date.now() - started).toBeLessThan(500)
  })
  it('rasterizes a declared SVG icon to a 64×64 PNG', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/fav.svg">'),
      'https://a.dev/fav.svg': () => image(SVG, 'image/svg+xml'),
    })
    expect(await expectPng(await discoverFavicon('https://a.dev/', fetchImpl))).toEqual([0, 0, 255, 255])
  })
  it('accepts an SVG served from /favicon.ico (e.g. after a redirect)', async () => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(SVG, 'image/svg+xml') })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ mimetype: 'image/png', ext: 'png' })
  })
  it('recognises an SVG served without an SVG content type', async () => {
    const xml = new TextEncoder().encode(`<?xml version="1.0"?>\n${SVG_TEXT}`)
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(xml, 'application/octet-stream') })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ mimetype: 'image/png', ext: 'png' })
  })
  it('skips a malformed SVG and tries the next candidate', async () => {
    const broken = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect')
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/fav.svg">'),
      'https://a.dev/fav.svg': () => image(broken, 'image/svg+xml'),
      'https://a.dev/favicon.ico': () => image(ICO, 'image/x-icon'),
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ mimetype: 'image/x-icon', ext: 'ico' })
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual(['https://a.dev/', 'https://a.dev/fav.svg', 'https://a.dev/favicon.ico'])
  })
  it('moves on to the next candidate when drawing runs out of time', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/fav.svg">'),
      'https://a.dev/fav.svg': () => image(SLOW_SVG, 'image/svg+xml'),
      'https://a.dev/favicon.ico': () => image(ICO, 'image/x-icon'),
    })
    const found = await discoverFavicon('https://a.dev/', fetchImpl, { ...DEFAULT_LIMITS, renderTimeoutMs: 1 })
    expect(found).toMatchObject({ mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('stops drawing once the overall deadline has passed', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/fav.svg">'),
      'https://a.dev/fav.svg': () => image(SLOW_SVG, 'image/svg+xml'),
      'https://a.dev/favicon.ico': () => image(ICO, 'image/x-icon'),
    })
    const started = Date.now()
    expect(await discoverFavicon('https://a.dev/', fetchImpl, { ...DEFAULT_LIMITS, totalTimeoutMs: 50 })).toBeNull()
    expect(Date.now() - started).toBeLessThan(300)
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).not.toContain('https://a.dev/favicon.ico')
  })
  it('skips candidates that are not images', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/page.png">'),
      'https://a.dev/page.png': () => html(''),
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
  })
  it('skips icons that answer with an error status', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/gone.png">'),
      'https://a.dev/gone.png': () => new Response(PNG, { status: 500, headers: { 'content-type': 'image/png' } }),
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
  })
  it('skips icons whose body exceeds the size cap', async () => {
    const big = new Uint8Array(600_000)
    big.set(PNG_MAGIC)
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/big.png">'),
      'https://a.dev/big.png': () => image(big, 'image/png'),
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
  })
  it('rejects an icon whose content-length header already exceeds the cap', async () => {
    const fetchImpl = stub({
      'https://a.dev/favicon.ico': () =>
        new Response(PNG, { headers: { 'content-type': 'image/png', 'content-length': '999999' } }),
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
  })
  it('returns null for non-http urls without fetching', async () => {
    const fetchImpl = stub({})
    expect(await discoverFavicon('mailto:a@b.dev', fetchImpl)).toBeNull()
    expect(await discoverFavicon('/about', fetchImpl)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('survives network errors', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    expect(await discoverFavicon('https://down.dev/', fetchImpl)).toBeNull()
  })
  it('requests at most 4 declared icons plus /favicon.ico', async () => {
    const links = Array.from({ length: 10 }, (_, i) => `<link rel="icon" href="/i${i}.png">`).join('')
    const fetchImpl = stub({ 'https://a.dev/': () => html(links) })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
    const requested = fetchImpl.mock.calls.map(([url]) => String(url))
    expect(requested).toHaveLength(1 + 5)
    expect(requested.at(-1)).toBe('https://a.dev/favicon.ico')
  })
  it('stops once the overall deadline has passed', async () => {
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const started = Date.now()
    const found = await discoverFavicon('https://slow.dev/', fetchImpl, { ...DEFAULT_LIMITS, totalTimeoutMs: 50 })
    expect(found).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
