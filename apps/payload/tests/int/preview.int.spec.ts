import type { Payload, PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Posts } from '@/collections/Posts'
import { buildPreviewUrl, livePreviewBreakpoints, postLivePreviewPath, postLivePreviewUrl, postPreviewPath } from '@/plugins/preview-url'

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

describe('postLivePreviewPath', () => {
  it.each([
    [7, '/blog/preview/7'],
    ['7', '/blog/preview/7'],
    [' abc ', '/blog/preview/abc'],
    ['a/b?c', '/blog/preview/a%2Fb%3Fc'],
  ])('builds the id-keyed preview path for %s', (id, path) => {
    expect(postLivePreviewPath(id)).toBe(path)
  })
  it.each([undefined, null, '', '   ', {}])('returns null for %s', (id) => {
    expect(postLivePreviewPath(id)).toBeNull()
  })
})

describe('postLivePreviewUrl', () => {
  it('points straight at the id-keyed page on the web app', () => {
    expect(postLivePreviewUrl({ webUrl: 'http://web.test/', id: 7 })).toBe('http://web.test/blog/preview/7')
  })
  it.each([
    ['web url', { webUrl: undefined, id: 7 }],
    ['blank web url', { webUrl: '  ', id: 7 }],
    ['id', { webUrl: 'http://web.test', id: undefined }],
  ])('returns null without a %s', (_, args) => {
    expect(postLivePreviewUrl(args)).toBeNull()
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

  it('loads the id-keyed page directly, without the /api/preview hop or the secret', async () => {
    vi.stubEnv('WEB_URL', 'http://web.test/')
    vi.stubEnv('PREVIEW_SECRET', 'test-secret')
    const url = await livePreviewUrl({ id: 7, slug: 'first-post' })
    expect(url).toBe('http://web.test/blog/preview/7')
    expect(url).not.toContain('previewSecret')
    expect(url).not.toContain('test-secret')
  })
  it('keeps the same URL while the unsaved slug follows the title', async () => {
    vi.stubEnv('WEB_URL', 'http://web.test')
    expect(await livePreviewUrl({ id: 7, slug: 't' })).toBe(await livePreviewUrl({ id: 7, slug: 'this-is' }))
  })
  it.each([
    ['the post has no id yet', { slug: 'first-post' }, 'http://web.test'],
    ['WEB_URL is not configured', { id: 7, slug: 'first-post' }, ''],
  ])('is null (no iframe) when %s', async (_, data, webUrl) => {
    vi.stubEnv('WEB_URL', webUrl)
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
