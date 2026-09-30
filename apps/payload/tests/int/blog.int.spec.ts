import type { User } from '@repo/cms-types'
import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishedOrAuthenticated } from '@/access/published-or-authenticated'
import { canRunJobs } from '@/access/run-jobs'
import { validateLinkUrl } from '@/fields/link-url'
import { relationIds } from '@/fields/relation-ids'
import { formatSlug } from '@/fields/slug'
import { toPopulatedAuthors } from '@/hooks/populate-authors'
import { isAutosave, revalidateAfterChange } from '@/hooks/revalidate-web'
import { blogPostUrl, categoryPath, seoTitle } from '@/plugins/blog-urls'

const user: User = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', updatedAt: '', createdAt: '', collection: 'users' }

const fakeReq = (signedIn: boolean, authorization?: string): PayloadRequest =>
  ({
    user: signedIn ? user : null,
    headers: new Headers(authorization ? { authorization } : {}),
  }) as unknown as PayloadRequest

describe('formatSlug', () => {
  it('lowercases, strips diacritics and joins words with dashes', () => {
    expect(formatSlug('Olá, Mundo! Ação 2026')).toBe('ola-mundo-acao-2026')
  })
  it('trims leading, trailing and repeated separators', () => {
    expect(formatSlug('  --Hello   World__  ')).toBe('hello-world')
  })
  it('transliterates letters NFKD cannot decompose', () => {
    expect(formatSlug('Straße Ørsted Łódź Đakovo Æsir Œuvre')).toBe('strasse-orsted-lodz-dakovo-aesir-oeuvre')
  })
  it('returns an empty string when nothing is left', () => {
    expect(formatSlug('!!!')).toBe('')
  })
})

describe('publishedOrAuthenticated', () => {
  it('lets signed-in users read everything', () => {
    expect(publishedOrAuthenticated({ req: fakeReq(true) })).toBe(true)
  })
  it('limits the public to published documents', () => {
    expect(publishedOrAuthenticated({ req: fakeReq(false) })).toEqual({ _status: { equals: 'published' } })
  })
})

describe('toPopulatedAuthors', () => {
  it('keeps id and name only, never the email', () => {
    const authors = toPopulatedAuthors([user])
    expect(authors).toEqual([{ id: '1', name: 'Ada Lovelace' }])
    expect(JSON.stringify(authors)).not.toContain('@')
  })
  it('falls back to an empty name', () => {
    expect(toPopulatedAuthors([{ id: 2, name: null }])).toEqual([{ id: '2', name: '' }])
  })
})

describe('relationIds', () => {
  it('reads raw and populated relationship values', () => {
    expect(relationIds([1, { id: 2 }, null, 'x'])).toEqual([1, 2])
    expect(relationIds(undefined)).toEqual([])
  })
})

describe('canRunJobs', () => {
  const original = process.env.CRON_SECRET
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })
  it('accepts signed-in users and the cron secret only', () => {
    process.env.CRON_SECRET = 's3cret'
    expect(canRunJobs({ req: fakeReq(true) })).toBe(true)
    expect(canRunJobs({ req: fakeReq(false, 'Bearer s3cret') })).toBe(true)
    expect(canRunJobs({ req: fakeReq(false, 'Bearer nope') })).toBe(false)
    expect(canRunJobs({ req: fakeReq(false, 'Bearer s3creX') })).toBe(false)
    expect(canRunJobs({ req: fakeReq(false) })).toBe(false)
  })
  it('never matches when no secret is configured', () => {
    delete process.env.CRON_SECRET
    expect(canRunJobs({ req: fakeReq(false, 'Bearer undefined') })).toBe(false)
  })
})

describe('blog urls', () => {
  it('builds the SEO title from the profile name', () => {
    expect(seoTitle('Hello', 'Vinicius')).toBe('Hello | Vinicius')
    expect(seoTitle('Hello', null)).toBe('Hello | Blog')
    expect(seoTitle('', undefined)).toBe('Blog')
  })
  it('builds post and category paths', () => {
    expect(blogPostUrl('https://site.dev/', 'hello')).toBe('https://site.dev/blog/hello')
    expect(blogPostUrl(undefined, null)).toBe('/blog')
    expect(categoryPath([{ slug: 'eng' }, { slug: 'web' }])).toBe('/eng/web')
  })
})

describe('validateLinkUrl', () => {
  it('rejects script URLs and accepts safe ones', () => {
    expect(validateLinkUrl('javascript:alert(1)')).not.toBe(true)
    expect(validateLinkUrl('//evil.example')).not.toBe(true)
    expect(validateLinkUrl('https://example.com')).toBe(true)
    expect(validateLinkUrl('/blog/hello')).toBe(true)
  })
})

describe('revalidateAfterChange', () => {
  const env = { WEB_URL: process.env.WEB_URL, REVALIDATE_SECRET: process.env.REVALIDATE_SECRET }
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  const run = async (query: Record<string, unknown>) => {
    process.env.WEB_URL = 'http://web.test'
    process.env.REVALIDATE_SECRET = 'secret'
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const req = { query, context: {}, payload: { logger: { warn: vi.fn() } } } as unknown as PayloadRequest
    // Unpublish after a draft edit: the stored doc and the previous one are both drafts.
    const args = { doc: { _status: 'draft' }, previousDoc: { _status: 'draft' }, req }
    await revalidateAfterChange(args as unknown as Parameters<CollectionAfterChangeHook>[0])
    return fetchMock.mock.calls.length
  }

  it('revalidates an unpublish that follows a draft edit', async () => {
    expect(await run({ draft: true })).toBe(1)
  })
  it('skips admin autosaves only', async () => {
    expect(await run({ autosave: true, draft: true })).toBe(0)
  })
  it('recognises the autosave flag raw or parsed', () => {
    expect(isAutosave({ query: { autosave: 'true' } })).toBe(true)
    expect(isAutosave({ query: { autosave: true } })).toBe(true)
    expect(isAutosave({ query: { autosave: 'false' } })).toBe(false)
    expect(isAutosave({ query: {} })).toBe(false)
  })
})
