import { decodeJwt, jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'
import { mintVisitorJwt, safeTimeZone } from '@/lib/twin/jwt'

const secret = 'j'.repeat(32)

describe('visitor jwt', () => {
  it('mints a 60-second HS256 token the agent channel accepts', async () => {
    const token = await mintVisitorJwt('7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e', 'Europe/Lisbon', secret, 1_000_000)
    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'portfolio-web', audience: 'portfolio-twin', currentDate: new Date(1_000_000 * 1000) })
    expect(protectedHeader.alg).toBe('HS256')
    expect(payload.sub).toBe('7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e')
    expect(payload.tz).toBe('Europe/Lisbon')
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60)
  })

  it('drops invalid time zones rather than forwarding them', () => {
    expect(safeTimeZone('Mars/Base')).toBeUndefined()
    expect(safeTimeZone('America/Sao_Paulo')).toBe('America/Sao_Paulo')
    expect(safeTimeZone(null)).toBeUndefined()
  })
})

describe('mintVisitorJwt analytics claims', () => {
  const VISITOR = '11111111-1111-4111-8111-111111111111'

  it('carries the PostHog ids when the browser has them', async () => {
    const token = await mintVisitorJwt(VISITOR, 'Europe/Lisbon', secret, 1_000, { distinctId: 'd-1', sessionId: 's-1' })
    expect(decodeJwt(token)).toMatchObject({ sub: VISITOR, tz: 'Europe/Lisbon', ph_did: 'd-1', ph_sid: 's-1' })
  })

  it('omits them otherwise', async () => {
    const claims = decodeJwt(await mintVisitorJwt(VISITOR, undefined, secret, 1_000, null))
    expect(claims).not.toHaveProperty('ph_did')
    expect(claims).not.toHaveProperty('ph_sid')
  })

  it('omits the session id when there is none', async () => {
    const claims = decodeJwt(await mintVisitorJwt(VISITOR, undefined, secret, 1_000, { distinctId: 'd-1', sessionId: null }))
    expect(claims).toMatchObject({ ph_did: 'd-1' })
    expect(claims).not.toHaveProperty('ph_sid')
  })
})
