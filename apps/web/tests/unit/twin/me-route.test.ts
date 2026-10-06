import { createConversation, createVisitor, listVisitorSessions, visitorExists } from '@repo/twin/db'
import { createTestDb, type TestDb } from '@repo/twin/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signVisitorCookie, VISITOR_COOKIE } from '@/lib/twin/cookie'

let t: TestDb
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), delete: (n: string) => void jar.delete(n) }),
}))
vi.mock('@/lib/twin/db', () => ({ twinDb: () => t.db }))

const COOKIE_KEY = 'c'.repeat(32)

beforeEach(async () => {
  t = await createTestDb()
  jar.clear()
  vi.stubEnv('TWIN_AGENT_URL', 'http://agent')
  vi.stubEnv('TWIN_JWT_SECRET', 'j'.repeat(32))
  vi.stubEnv('TWIN_COOKIE_SECRET', COOKIE_KEY)
  vi.stubEnv('TWIN_DATABASE_URL', 'postgres://unused/x')
  vi.stubEnv('TWIN_REDACT_SECRET', 'r'.repeat(32))
  vi.stubEnv('TWIN_PROMPT_CANARY', 'canary-0123456789abcdef')
  vi.stubEnv('CMS_URL', 'http://cms')
}, 60_000)
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await t.close()
})

async function visitorWithSession() {
  const id = await createVisitor(t.db)
  await createConversation(t.db, 'wrun_1', id)
  jar.set(VISITOR_COOKIE, signVisitorCookie(id, COOKIE_KEY))
  return id
}

describe('DELETE /api/twin/me', () => {
  it('retires sessions, deletes the rows and clears the cookie', async () => {
    const id = await visitorWithSession()
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { DELETE } = await import('@/app/api/twin/me/route')
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('http://agent/eve/v1/session/wrun_1/reset')
    expect(await visitorExists(t.db, id)).toBe(false)
    expect(jar.has(VISITOR_COOKIE)).toBe(false)
  })

  it('tolerates sessions eve no longer knows (404) or already retired (409)', async () => {
    const id = await visitorWithSession()
    await createConversation(t.db, 'wrun_2', id)
    const statuses = [404, 409]
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: statuses.shift() ?? 500 })))
    const { DELETE } = await import('@/app/api/twin/me/route')
    expect((await DELETE()).status).toBe(204)
    expect(await visitorExists(t.db, id)).toBe(false)
  })

  it('does nothing without a visitor cookie', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { DELETE } = await import('@/app/api/twin/me/route')
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the rows and the cookie, logs, and returns a bare 500 when a reset fails', async () => {
    const id = await visitorWithSession()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { DELETE } = await import('@/app/api/twin/me/route')
    const res = await DELETE()
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('')
    expect(log).toHaveBeenCalled()
    expect(await visitorExists(t.db, id)).toBe(true)
    expect(await listVisitorSessions(t.db, id)).toEqual(['wrun_1'])
    expect(jar.has(VISITOR_COOKIE)).toBe(true)
  })
})
