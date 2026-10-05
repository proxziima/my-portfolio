import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('webhook forwarder', () => {
  it('forwards the raw body and only the signature headers to the agent', async () => {
    vi.stubEnv('TWIN_AGENT_URL', 'http://agent')
    const seen: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response('ok')
    }))
    const { POST } = await import('@/app/api/twin/hooks/[provider]/route')
    const body = '{"triggerEvent":"BOOKING_CREATED"}'
    const res = await POST(new Request('http://web/api/twin/hooks/cal', { method: 'POST', body, headers: { 'x-cal-signature-256': 'abc', cookie: 'x=y' } }), { params: Promise.resolve({ provider: 'cal' }) })
    expect(res.status).toBe(200)
    expect(seen[0]?.url).toBe('http://agent/webhooks/cal')
    expect(seen[0]?.init.body).toBe(body)
    expect(new Headers(seen[0]?.init.headers).get('cookie')).toBeNull()
    expect(new Headers(seen[0]?.init.headers).get('x-cal-signature-256')).toBe('abc')
  })

  it('404s unknown providers without calling the agent', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { POST } = await import('@/app/api/twin/hooks/[provider]/route')
    const res = await POST(new Request('http://web/x', { method: 'POST', body: '' }), { params: Promise.resolve({ provider: 'github' }) })
    expect(res.status).toBe(404)
  })
})
