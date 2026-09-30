import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const draft = { isEnabled: false, enable: vi.fn(), disable: vi.fn() }
vi.mock('next/headers', () => ({ draftMode: async () => draft }))
// next/navigation's redirect() throws to unwind the handler; mirror that with the target in the message.
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`)
  },
}))

const { GET: preview } = await import('@/app/api/preview/route')
const { GET: exitPreview } = await import('@/app/api/exit-preview/route')

const SECRET = 'route-test-secret'
const previewRequest = (query: string, cookie?: string) =>
  new Request(`http://web.test/api/preview?${query}`, cookie ? { headers: { cookie } } : {})

beforeEach(() => {
  vi.stubEnv('PREVIEW_SECRET', SECRET)
  draft.enable.mockClear()
  draft.disable.mockClear()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('GET /api/preview', () => {
  it('is 403 with a wrong or missing secret', async () => {
    expect((await preview(previewRequest('path=/blog/a&previewSecret=nope'))).status).toBe(403)
    expect((await preview(previewRequest('path=/blog/a'))).status).toBe(403)
    expect(draft.enable).not.toHaveBeenCalled()
  })
  it('is 400 for an unsafe path', async () => {
    for (const path of ['//evil', '/%5Cevil', 'https%3A%2F%2Fx', '']) {
      expect((await preview(previewRequest(`path=${path}&previewSecret=${SECRET}`))).status).toBe(400)
    }
    expect(draft.enable).not.toHaveBeenCalled()
  })
  it('is 403 and turns draft mode off without an admin session', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await preview(previewRequest(`path=/blog/a&previewSecret=${SECRET}`))).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(draft.disable).toHaveBeenCalledOnce()
    expect(draft.enable).not.toHaveBeenCalled()
  })
  it('is 403 when the CMS does not recognise the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ user: null })))
    expect((await preview(previewRequest(`path=/blog/a&previewSecret=${SECRET}`, 'payload-token=stale'))).status).toBe(403)
    expect(draft.disable).toHaveBeenCalledOnce()
  })
  it('enables draft mode and redirects for a signed-in editor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ user: { id: 1 } })))
    await expect(preview(previewRequest(`path=/blog/a&previewSecret=${SECRET}`, 'payload-token=jwt'))).rejects.toThrow('REDIRECT /blog/a')
    expect(draft.enable).toHaveBeenCalledOnce()
  })
})

describe('GET /api/exit-preview', () => {
  const exit = (query = '') => exitPreview(new Request(`http://web.test/api/exit-preview${query}`))

  it('turns draft mode off and goes home by default', async () => {
    await expect(exit()).rejects.toThrow('REDIRECT /')
    expect(draft.disable).toHaveBeenCalledOnce()
  })
  it('follows a safe path and falls back to / for an unsafe one', async () => {
    await expect(exit('?path=/blog/a')).rejects.toThrow('REDIRECT /blog/a')
    await expect(exit('?path=//evil')).rejects.toThrow(/^REDIRECT \/$/)
  })
})
