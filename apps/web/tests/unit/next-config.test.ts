import { describe, expect, it } from 'vitest'
import config from '@/next.config.js'

describe('next.config headers', () => {
  it('serves hashed assets as immutable and other public files with a short revalidating cache', async () => {
    const rules = await config.headers!()
    const find = (source: string) => rules.find((r) => r.source === source)?.headers.find((h) => h.key === 'Cache-Control')?.value
    expect(find('/assets/:path*')).toBe('public, max-age=31536000, immutable')
    expect(find('/:file((?!_next/|assets/).*\\.(?:jsdos|wasm|png|ico|css|js))')).toBe('public, max-age=3600, stale-while-revalidate=86400')
  })

  it('leaves Next static chunks and hashed assets out of the revalidating rule', async () => {
    const rules = await config.headers!()
    const source = rules.find((r) => r.source.startsWith('/:file('))!.source
    const re = new RegExp(`^${source.replace('/:file(', '/(')}$`)
    expect(re.test('/js-dos/js-dos.js')).toBe(true)
    expect(re.test('/doom.jsdos')).toBe(true)
    expect(re.test('/_next/static/chunks/a.js')).toBe(false)
    expect(re.test('/assets/desk.abc123.png')).toBe(false)
  })

  it('inlines the CSS', () => {
    expect(config.experimental?.inlineCss).toBe(true)
  })
})
