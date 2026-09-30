import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Media, Post } from '@repo/cms-types'
import { toPostView } from '@/lib/cms/mappers'
import { getPreviewUser, isPreviewSecret, isSafePreviewPath, readCookie } from '@/lib/cms/preview'
import { secretsMatch } from '@/lib/security/secrets'

describe('isSafePreviewPath', () => {
  it.each(['/blog/a', '/', '/blog/a?x=1#top', '/blog/%C3%A1', '/blog/preview/42'])('accepts %s', (path) => {
    expect(isSafePreviewPath(path)).toBe(true)
  })
  it.each([
    '', null, undefined, '//evil', '//evil.com/x', '/\\evil', '/\\/evil', 'https://x', 'http://x/blog',
    'javascript:alert(1)', '/javascript:alert(1)', '/http://x', 'blog/a', '#top', ' /blog/a', '/blog/a b',
    '/blog/\ta', '/%2F/evil', '/%5Cevil', '/%252F/evil', '/%09/evil',
  ])('rejects %j', (path) => {
    expect(isSafePreviewPath(path)).toBe(false)
  })
})

describe('secretsMatch', () => {
  it('matches equal secrets', () => {
    expect(secretsMatch('s3cret', 's3cret')).toBe(true)
  })
  it.each([
    ['a different secret', 'nope', 's3cret'],
    ['a prefix', 's3c', 's3cret'],
    ['no provided value', null, 's3cret'],
    ['an empty provided value', '', 's3cret'],
    ['no expected value', 's3cret', undefined],
    ['two empty values', '', ''],
  ])('rejects %s', (_, provided, expected) => {
    expect(secretsMatch(provided, expected)).toBe(false)
  })
})

describe('isPreviewSecret', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('compares against PREVIEW_SECRET and fails closed when it is unset', () => {
    vi.stubEnv('PREVIEW_SECRET', 'expected')
    expect(isPreviewSecret('expected')).toBe(true)
    expect(isPreviewSecret('other')).toBe(false)
    vi.stubEnv('PREVIEW_SECRET', '')
    expect(isPreviewSecret('')).toBe(false)
  })
})

describe('readCookie', () => {
  it('reads one cookie out of a header', () => {
    expect(readCookie('a=1; payload-token=abc.def=; b=2', 'payload-token')).toBe('abc.def=')
    expect(readCookie('a=1', 'payload-token')).toBeUndefined()
    expect(readCookie(null, 'payload-token')).toBeUndefined()
  })
})

describe('getPreviewUser', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stubFetch = (body: unknown, status = 200) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('does not call the CMS without a Payload token', async () => {
    const fetchMock = stubFetch({ user: { id: 1 } })
    expect(await getPreviewUser('__prerender_bypass=x')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('forwards only the token cookie to /api/users/me, uncached', async () => {
    const fetchMock = stubFetch({ user: { id: 1, email: 'ada@example.com' } })
    expect(await getPreviewUser('theme=dark; payload-token=jwt')).toEqual({ id: '1' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.pathname).toBe('/api/users/me')
    expect(init).toMatchObject({ cache: 'no-store', headers: { cookie: 'payload-token=jwt' } })
  })
  it('is null when the CMS knows no user, errors or is down', async () => {
    stubFetch({ user: null })
    expect(await getPreviewUser('payload-token=jwt')).toBeNull()
    stubFetch({ errors: [] }, 500)
    expect(await getPreviewUser('payload-token=jwt')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect(await getPreviewUser('payload-token=jwt')).toBeNull()
  })
})

describe('toPostView', () => {
  const hero = { id: 5, alt: 'Hero', url: '/api/media/file/hero.png', updatedAt: '', createdAt: '' } as Media
  const post = {
    id: 1,
    title: 'Hello',
    slug: 'hello',
    excerpt: 'Short',
    heroImage: hero,
    content: { root: { type: 'root', children: [], direction: null, format: '', indent: 0, version: 1 } },
    publishedAt: '2026-09-30T00:00:00.000Z',
    authors: [{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com', updatedAt: '', createdAt: '', collection: 'users' }],
    populatedAuthors: [{ id: '1', name: 'Ada Lovelace' }, { id: '2', name: '  ' }],
    updatedAt: '',
    createdAt: '',
    _status: 'draft',
  } as Post

  it('keeps public fields and resolves the hero image against the CMS', () => {
    expect(toPostView(post, 'http://cms.test')).toEqual({
      title: 'Hello',
      slug: 'hello',
      excerpt: 'Short',
      content: post.content,
      publishedAt: '2026-09-30T00:00:00.000Z',
      authors: ['Ada Lovelace'],
      heroImage: { url: 'http://cms.test/api/media/file/hero.png', alt: 'Hero' },
      status: 'draft',
    })
  })
  it('never carries author emails', () => {
    expect(JSON.stringify(toPostView(post, 'http://cms.test'))).not.toContain('@example.com')
  })
  it('drops optional fields that are empty', () => {
    const bare = { ...post, excerpt: null, heroImage: 5, publishedAt: null, populatedAuthors: null, _status: 'published' } as Post
    expect(toPostView(bare, 'http://cms.test')).toEqual({ title: 'Hello', slug: 'hello', content: post.content, authors: [], status: 'published' })
  })
})
