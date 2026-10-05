import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIMITS, discoverFavicon, iconLinks } from '@/favicons/discover'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const PNG_BIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9, 9])
const ICO = Uint8Array.from([0, 0, 1, 0, 1, 0, 16, 16])

const html = (head: string) => new Response(`<html><head>${head}</head></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
const image = (bytes: Uint8Array, type: string) => new Response(bytes, { headers: { 'content-type': type } })
const notFound = () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })

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
  it('skips SVG icons, by type or by extension', () => {
    const page = `
      <link rel="icon" href="/vector.svg" type="image/svg+xml">
      <link rel="icon" href="/other.SVG">
      <link rel="icon" href="/ok.png">`
    expect(iconLinks(page, 'https://a.dev/')).toEqual(['https://a.dev/ok.png'])
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

describe('discoverFavicon', () => {
  it('returns the best declared icon', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/icon.png" sizes="32x32">'),
      'https://a.dev/icon.png': () => image(PNG, 'image/png'),
    })
    const found = await discoverFavicon('https://a.dev/', fetchImpl)
    expect(found).toMatchObject({ mimetype: 'image/png', ext: 'png' })
    expect(found?.data.length).toBe(PNG.length)
  })
  it('fetches the largest declared icon first', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () =>
        html('<link rel="icon" href="/s.png" sizes="16x16"><link rel="icon" href="/b.png" sizes="64x64">'),
      'https://a.dev/s.png': () => image(PNG, 'image/png'),
      'https://a.dev/b.png': () => image(PNG_BIG, 'image/png'),
    })
    const found = await discoverFavicon('https://a.dev/', fetchImpl)
    expect(fetchImpl.mock.calls[1]![0]).toBe('https://a.dev/b.png')
    expect(found?.data.length).toBe(PNG_BIG.length)
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
  it('trusts the bytes over a wrong declared type', async () => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(PNG, 'image/gif') })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ mimetype: 'image/png', ext: 'png' })
  })
  it('never accepts SVG, even from /favicon.ico', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(svg, 'image/svg+xml') })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
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
    big.set(PNG)
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
