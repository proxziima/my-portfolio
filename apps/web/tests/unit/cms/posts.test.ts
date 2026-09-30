import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPostById, getPostBySlug } from '@/lib/cms/posts'

const post = {
  id: 1, title: 'Hello', slug: 'hello', content: { root: { type: 'root', children: [] } },
  populatedAuthors: [{ id: '1', name: 'Ada' }], updatedAt: '', createdAt: '', _status: 'draft',
}

const stubFetch = (docs: unknown[] = [post], status = 200, body: unknown = { docs }) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const lastCall = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.at(-1) as unknown as [URL | string, RequestInit & { next?: { tags?: string[] } }]

afterEach(() => vi.unstubAllGlobals())

describe('getPostBySlug', () => {
  it('reads the latest draft with the editor token, uncached and time-limited', async () => {
    const fetchMock = stubFetch()
    expect(await getPostBySlug('hello', { draft: true, token: 'jwt' })).toMatchObject({ title: 'Hello', authors: ['Ada'] })
    const [url, init] = lastCall(fetchMock)
    const params = new URL(String(url)).searchParams
    expect(params.get('draft')).toBe('true')
    expect(params.get('where[slug][equals]')).toBe('hello')
    expect(params.get('depth')).toBe('2')
    expect(params.get('limit')).toBe('1')
    expect(init.headers).toEqual({ Authorization: 'JWT jwt' })
    expect(init.cache).toBe('no-store')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.next).toBeUndefined()
  })
  it('reads published posts through the cms-tagged cache, without draft or auth', async () => {
    const fetchMock = stubFetch()
    await getPostBySlug('hello', { draft: false, token: 'jwt' })
    const [url, init] = lastCall(fetchMock)
    const params = new URL(String(url)).searchParams
    expect(params.has('draft')).toBe(false)
    expect(params.get('where[slug][equals]')).toBe('hello')
    expect(init.next?.tags).toEqual(['cms'])
    expect(init.headers).toBeUndefined()
  })
  it('is null when nothing matches and throws on a CMS error', async () => {
    stubFetch([])
    expect(await getPostBySlug('missing', { draft: true, token: 'jwt' })).toBeNull()
    stubFetch([], 500)
    await expect(getPostBySlug('hello', { draft: true, token: 'jwt' })).rejects.toThrow('CMS 500')
  })
})

describe('getPostById', () => {
  it('reads the latest draft by id with the editor token, uncached and time-limited', async () => {
    const fetchMock = stubFetch([], 200, post)
    expect(await getPostById('7', { token: 'jwt' })).toMatchObject({ title: 'Hello', authors: ['Ada'] })
    const [url, init] = lastCall(fetchMock)
    const parsed = new URL(String(url))
    expect(parsed.pathname).toBe('/api/posts/7')
    expect(parsed.searchParams.get('draft')).toBe('true')
    expect(parsed.searchParams.get('depth')).toBe('2')
    expect(init.headers).toEqual({ Authorization: 'JWT jwt' })
    expect(init.cache).toBe('no-store')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.next).toBeUndefined()
  })
  it('encodes the id into a single path segment', async () => {
    const fetchMock = stubFetch([], 200, post)
    await getPostById('a/../b', { token: 'jwt' })
    expect(new URL(String(lastCall(fetchMock)[0])).pathname).toBe('/api/posts/a%2F..%2Fb')
  })
  it('is null when the CMS has no such post and throws on a CMS error', async () => {
    stubFetch([], 404, { errors: [{ message: 'Not Found' }] })
    expect(await getPostById('404', { token: 'jwt' })).toBeNull()
    stubFetch([], 500, {})
    await expect(getPostById('7', { token: 'jwt' })).rejects.toThrow('CMS 500')
  })
})
