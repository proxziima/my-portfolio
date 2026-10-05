import { jwtVerify } from 'jose'
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
