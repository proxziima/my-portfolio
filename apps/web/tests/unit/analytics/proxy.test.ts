import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxy } from '@/proxy'

const relayRequest = () => new NextRequest('http://localhost/relay/e/?ip=0', { headers: { cookie: 'twin_vid=x', 'x-keep': 'y' } })

afterEach(() => vi.unstubAllEnvs())

describe('relay proxy', () => {
  it('rewrites to PostHog without forwarding the site cookies', () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_test')
    const response = proxy(relayRequest())
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://us.i.posthog.com/e/?ip=0')
    expect(response.headers.get('x-middleware-request-host')).toBe('us.i.posthog.com')
    expect(response.headers.get('x-middleware-request-x-keep')).toBe('y')
    expect(response.headers.get('x-middleware-request-cookie')).toBeNull()
    expect(response.headers.get('x-middleware-override-headers')).not.toContain('cookie')
  })

  it('answers 404 when no token is configured', () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')
    expect(proxy(relayRequest()).status).toBe(404)
  })
})
