import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { toVisitorPrincipal, visitorAuth } from '../agent/lib/visitor-auth'

const SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789'
const VISITOR = '7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e'

vi.mock('../agent/lib/env', () => ({ getEnv: () => ({ TWIN_JWT_SECRET: SECRET }) }))

const b64 = (value: object | string) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

/** A HS256 JWT minted the way the BFF does, with overridable claims and secret. */
function mint(claims: Record<string, unknown>, secret = SECRET): string {
  const now = Math.floor(Date.now() / 1000)
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'portfolio-web', aud: 'portfolio-twin', iat: now, exp: now + 60, ...claims })}`
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`
}

const request = (token?: string) => new Request('http://agents/eve/v1/session', { headers: token ? { authorization: `Bearer ${token}` } : {} })

describe('toVisitorPrincipal', () => {
  it('turns a verified web JWT principal into a user principal keyed by visitor', () => {
    const p = toVisitorPrincipal({ principalType: 'service', principalId: 'portfolio-web:7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e', authenticator: 'jwt-hmac', issuer: 'portfolio-web', subject: '7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e', attributes: { tz: 'Europe/Lisbon' } })
    expect(p).toEqual({ principalType: 'user', principalId: 'web:7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e', authenticator: 'twin-web', issuer: 'portfolio-web', subject: '7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e', attributes: { tz: 'Europe/Lisbon' } })
  })

  it('rejects a subject that is not a visitor uuid', () => {
    expect(toVisitorPrincipal({ principalType: 'service', principalId: 'x:y', authenticator: 'jwt-hmac', issuer: 'portfolio-web', subject: 'admin', attributes: {} })).toBeNull()
  })
})

describe('visitorAuth', () => {
  it('accepts a BFF-minted token and keeps the tz claim', async () => {
    const p = await visitorAuth(request(mint({ sub: VISITOR, tz: 'Europe/Lisbon' })))
    expect(p).toMatchObject({ principalType: 'user', principalId: `web:${VISITOR}`, attributes: { tz: 'Europe/Lisbon' } })
  })

  it('skips a missing header, a bad signature, a wrong audience and a non-uuid subject', async () => {
    expect(await visitorAuth(request())).toBeNull()
    expect(await visitorAuth(request(mint({ sub: VISITOR }, 'another-secret-that-is-long-enough-0123456789')))).toBeNull()
    expect(await visitorAuth(request(mint({ sub: VISITOR, aud: 'someone-else' })))).toBeNull()
    expect(await visitorAuth(request(mint({ sub: 'admin' })))).toBeNull()
    expect(await visitorAuth(request(mint({})))).toBeNull()
  })
})
