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

  it('forwards the Photon body and Spectrum signature headers, and nothing else', async () => {
    vi.stubEnv('TWIN_AGENT_URL', 'http://agent')
    const seen: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response(null, { status: 200 })
    }))
    const { POST } = await import('@/app/api/twin/hooks/[provider]/route')
    const body = '{"event":"messages","message":{"id":"spc-msg-1"}}'
    const headers = {
      'content-type': 'application/json',
      'x-spectrum-signature': 'v0=abc',
      'x-spectrum-timestamp': '1790000000',
      'x-spectrum-event': 'messages',
      'x-spectrum-webhook-id': 'wh-1',
      cookie: 'x=y',
      authorization: 'Bearer t',
    }
    const res = await POST(new Request('http://web/api/twin/hooks/photon', { method: 'POST', body, headers }), { params: Promise.resolve({ provider: 'photon' }) })
    expect(res.status).toBe(200)
    expect(seen[0]?.url).toBe('http://agent/webhooks/photon')
    expect(seen[0]?.init.body).toBe(body)
    const forwarded = new Headers(seen[0]?.init.headers)
    expect(forwarded.get('content-type')).toBe('application/json')
    expect(forwarded.get('x-spectrum-signature')).toBe('v0=abc')
    expect(forwarded.get('x-spectrum-timestamp')).toBe('1790000000')
    expect(forwarded.get('x-spectrum-event')).toBe('messages')
    expect(forwarded.get('x-spectrum-webhook-id')).toBe('wh-1')
    expect(forwarded.get('cookie')).toBeNull()
    expect(forwarded.get('authorization')).toBeNull()
  })

  it('relays the agent status and body for Photon', async () => {
    vi.stubEnv('TWIN_AGENT_URL', 'http://agent')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))
    const { POST } = await import('@/app/api/twin/hooks/[provider]/route')
    const res = await POST(new Request('http://web/api/twin/hooks/photon', { method: 'POST', body: '{}' }), { params: Promise.resolve({ provider: 'photon' }) })
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('unauthorized')
  })

  it.each(['github', 'telegram', 'sendblue', 'constructor', '__proto__', 'toString'])('404s %s without calling the agent', async provider => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('@/app/api/twin/hooks/[provider]/route')
    const res = await POST(new Request('http://web/x', { method: 'POST', body: '' }), { params: Promise.resolve({ provider }) })
    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
