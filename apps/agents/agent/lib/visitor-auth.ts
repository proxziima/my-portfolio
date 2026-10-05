import { extractBearerToken, verifyJwtHmac, type AuthFn } from 'eve/channels/auth'
import { getEnv } from './env'
import { visitorIdOf, type Principal } from './identity'

/** A principal plus the JWT issuer and subject eve carries alongside it. */
export type VisitorPrincipal = Principal & { issuer?: string; subject?: string }

/**
 * eve's jwtHmac always yields a `service` principal; visitors must be `user` principals so
 * per-principal memory works and webhooks (service) stay distinguishable (spec §8).
 * Returns null unless the subject is a visitor uuid.
 */
export function toVisitorPrincipal(p: VisitorPrincipal): VisitorPrincipal | null {
  if (!p.subject) return null
  const visitor: VisitorPrincipal = { principalType: 'user', principalId: `web:${p.subject}`, authenticator: 'twin-web', issuer: p.issuer, subject: p.subject, attributes: p.attributes }
  return visitorIdOf(visitor) ? visitor : null
}

/**
 * Route auth for the BFF-minted visitor JWT (60 s, HS256, iss portfolio-web, aud portfolio-twin).
 * `verifyJwtHmac` reports every failure as `{ ok: false }`, so a bad token skips to the next entry.
 */
export const visitorAuth: AuthFn<Request> = async (request) => {
  const token = extractBearerToken(request.headers.get('authorization'))
  if (!token) return null
  const result = await verifyJwtHmac(token, {
    algorithm: 'HS256',
    issuer: 'portfolio-web',
    audiences: ['portfolio-twin'],
    secret: getEnv().TWIN_JWT_SECRET,
  })
  return result.ok ? toVisitorPrincipal(result.sessionAuth) : null
}
