import { SignJWT } from 'jose'
import { isTimeZone } from '@repo/twin/env'

/** A browser-reported IANA zone, or undefined when absent or invalid. */
export function safeTimeZone(value: string | null | undefined): string | undefined {
  return value && value.length <= 64 && isTimeZone(value) ? value : undefined
}

/**
 * The 60-second token the agent's channel verifies (iss portfolio-web, aud portfolio-twin).
 * Minted per proxied request; the browser never sees it.
 */
export async function mintVisitorJwt(visitorId: string, tz: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  return new SignJWT(tz ? { tz } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('portfolio-web')
    .setAudience('portfolio-twin')
    .setSubject(visitorId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 60)
    .sign(new TextEncoder().encode(secret))
}
