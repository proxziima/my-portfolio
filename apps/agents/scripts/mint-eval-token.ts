import { SignJWT } from 'jose'

/**
 * Prints a JWT for `eve eval --url` against a self-hosted twin (EVE_EVAL_AUTH_TOKEN). It acts
 * as one fixed eval visitor, valid for an hour: a run needs longer than a visitor's 60 seconds.
 */
const secret = process.env.TWIN_JWT_SECRET
if (!secret) throw new Error('TWIN_JWT_SECRET is required')
const now = Math.floor(Date.now() / 1000)
const token = await new SignJWT({})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer('portfolio-web')
  .setAudience('portfolio-twin')
  .setSubject('00000000-0000-4000-8000-0000000000e1')
  .setIssuedAt(now)
  .setExpirationTime(now + 3600)
  .sign(new TextEncoder().encode(secret))
process.stdout.write(token)
