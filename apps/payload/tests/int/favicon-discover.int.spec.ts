import { describe, expect, it, vi } from 'vitest'
import { discoverFavicon, iconLinks } from '@/favicons/discover'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const ICO = Uint8Array.from([0, 0, 1, 0, 1, 0, 16, 16])

const html = (head: string) => new Response(`<html><head>${head}</head></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
const image = (bytes: Uint8Array, type: string) => new Response(bytes, { headers: { 'content-type': type } })
const notFound = () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })

/** A fetch stub answering from a url → response factory table; anything else 404s. */
const stub = (routes: Record<string, () => Response>) =>
  vi.fn(async (input: string | URL | Request) => (routes[String(input)] ?? notFound)())

describe('iconLinks', () => {
  it('ranks declared icons by size, any/svg first, and resolves relative hrefs', () => {
    const page = `
      <link rel="icon" href="/small.png" sizes="16x16">
      <link rel="apple-touch-icon" href="touch.png" sizes="180x180">
      <link rel="stylesheet" href="/x.css">
      <link rel="shortcut icon" href="/legacy.ico">
      <link href='/vector.svg' rel='icon' type='image/svg+xml'>`
    expect(iconLinks(page, 'https://a.dev/en/')).toEqual([
      'https://a.dev/vector.svg',
      'https://a.dev/en/touch.png',
      'https://a.dev/small.png',
      'https://a.dev/legacy.ico',
    ])
  })
  it('ignores non-http hrefs', () => {
    expect(iconLinks('<link rel="icon" href="data:image/png;base64,AAAA">', 'https://a.dev/')).toEqual([])
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
  it('falls back to /favicon.ico at the origin', async () => {
    const fetchImpl = stub({
      'https://a.dev/team': () => html(''),
      'https://a.dev/favicon.ico': () => image(ICO, 'image/x-icon'),
    })
    expect(await discoverFavicon('https://a.dev/team', fetchImpl)).toMatchObject({ mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('sniffs icons served as application/octet-stream', async () => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(ICO, 'application/octet-stream') })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('skips non-image and oversize candidates', async () => {
    const big = new Uint8Array(600_000)
    big.set(PNG)
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/big.png"><link rel="icon" href="/page.png">'),
      'https://a.dev/big.png': () => image(big, 'image/png'),
      'https://a.dev/page.png': () => html(''),
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
})
