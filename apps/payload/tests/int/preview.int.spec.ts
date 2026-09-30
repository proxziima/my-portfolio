import type { Payload, PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Posts } from '@/collections/Posts'
import { buildPreviewUrl, livePreviewBreakpoints, postPreviewPath } from '@/plugins/preview-url'

describe('buildPreviewUrl', () => {
  it('points at the web preview route with an encoded path and secret', () => {
    const url = buildPreviewUrl({ webUrl: 'http://localhost:3000/', secret: 's3 cr&t', path: '/blog/hello' })
    expect(url).toBe('http://localhost:3000/api/preview?path=%2Fblog%2Fhello&previewSecret=s3+cr%26t')
    const params = new URL(url ?? '').searchParams
    expect(params.get('path')).toBe('/blog/hello')
    expect(params.get('previewSecret')).toBe('s3 cr&t')
  })
  it.each([
    ['web url', { webUrl: undefined, secret: 's', path: '/blog/a' }],
    ['blank web url', { webUrl: '  ', secret: 's', path: '/blog/a' }],
    ['secret', { webUrl: 'http://w.test', secret: '', path: '/blog/a' }],
    ['path', { webUrl: 'http://w.test', secret: 's', path: null }],
  ])('returns null without a %s', (_, args) => {
    expect(buildPreviewUrl(args)).toBeNull()
  })
})

describe('postPreviewPath', () => {
  it('builds the blog path from the slug', () => {
    expect(postPreviewPath('hello-world')).toBe('/blog/hello-world')
  })
  it('encodes anything unexpected in the slug', () => {
    expect(postPreviewPath('a/b?c')).toBe('/blog/a%2Fb%3Fc')
  })
  it.each([undefined, null, '', '   ', 42])('returns null for %s', (slug) => {
    expect(postPreviewPath(slug)).toBeNull()
  })
})

describe('Posts admin.preview', () => {
  afterEach(() => vi.unstubAllEnvs())

  const preview = (doc: Record<string, unknown>) => {
    const fn = Posts.admin?.preview
    if (!fn) throw new Error('Posts.admin.preview is not configured')
    return fn(doc, { locale: 'en', req: {} as PayloadRequest, token: null })
  }

  it('returns the web preview URL for a doc with a slug', async () => {
    vi.stubEnv('WEB_URL', 'http://web.test')
    vi.stubEnv('PREVIEW_SECRET', 'test-secret')
    expect(await preview({ slug: 'first-post' })).toBe(
      'http://web.test/api/preview?path=%2Fblog%2Ffirst-post&previewSecret=test-secret',
    )
  })
  it('hides the button while the doc has no slug', async () => {
    vi.stubEnv('WEB_URL', 'http://web.test')
    vi.stubEnv('PREVIEW_SECRET', 'test-secret')
    expect(await preview({ slug: null })).toBeNull()
  })
  it('hides the button when the secret is not configured', async () => {
    vi.stubEnv('WEB_URL', 'http://web.test')
    vi.stubEnv('PREVIEW_SECRET', '')
    expect(await preview({ slug: 'first-post' })).toBeNull()
  })
})

describe('Posts admin.livePreview', () => {
  afterEach(() => vi.unstubAllEnvs())

  const livePreviewUrl = (data: Record<string, unknown>) => {
    const url = Posts.admin?.livePreview?.url
    if (typeof url !== 'function') throw new Error('Posts.admin.livePreview.url is not a function')
    return url({ data, locale: { code: 'en', label: 'English' }, payload: {} as Payload, req: {} as PayloadRequest })
  }

  it('loads the draft-preview entry route for the post in the iframe', async () => {
    vi.stubEnv('WEB_URL', 'http://web.test/')
    vi.stubEnv('PREVIEW_SECRET', 'test-secret')
    expect(await livePreviewUrl({ slug: 'first-post' })).toBe(
      'http://web.test/api/preview?path=%2Fblog%2Ffirst-post&previewSecret=test-secret',
    )
  })
  it('matches the Preview button URL', async () => {
    vi.stubEnv('WEB_URL', 'http://web.test')
    vi.stubEnv('PREVIEW_SECRET', 'test-secret')
    const preview = Posts.admin?.preview
    const doc = { slug: 'same' }
    expect(await livePreviewUrl(doc)).toBe(await preview?.(doc, { locale: 'en', req: {} as PayloadRequest, token: null }))
  })
  it.each([
    ['the post has no slug yet', { slug: '' }, 'test-secret'],
    ['the secret is not configured', { slug: 'first-post' }, ''],
  ])('is null (no iframe) when %s', async (_, data, secret) => {
    vi.stubEnv('WEB_URL', 'http://web.test')
    vi.stubEnv('PREVIEW_SECRET', secret)
    expect(await livePreviewUrl(data)).toBeNull()
  })
})

describe('livePreviewBreakpoints', () => {
  it('offers mobile, tablet and desktop sizes', () => {
    expect(livePreviewBreakpoints.map(({ name, width, height }) => [name, width, height])).toEqual([
      ['mobile', 375, 667],
      ['tablet', 768, 1024],
      ['desktop', 1440, 900],
    ])
  })
})
