import 'server-only'
import { createVisitor, touchVisitor, visitorExists } from '@repo/twin/db'
import { cookies } from 'next/headers'
import { signVisitorCookie, verifyVisitorCookie, VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE } from './cookie'
import { twinDb } from './db'
import { twinEnv } from './env'

/**
 * The visitor behind this request, creating one (and its cookie) on first contact. Next 16.3:
 * `cookies()` is async and settable in Route Handlers, and must be set before the body streams.
 */
export async function currentVisitor(): Promise<string> {
  const jar = await cookies()
  const key = twinEnv().TWIN_COOKIE_SECRET
  const known = verifyVisitorCookie(jar.get(VISITOR_COOKIE)?.value, key)
  const id = known && (await visitorExists(twinDb(), known)) ? known : await createVisitor(twinDb())
  if (id !== known) {
    jar.set(VISITOR_COOKIE, signVisitorCookie(id, key), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: VISITOR_COOKIE_MAX_AGE,
    })
  }
  await touchVisitor(twinDb(), id)
  return id
}

/** The visitor id from the cookie without creating one (deletion endpoint). */
export async function existingVisitor(): Promise<string | null> {
  const jar = await cookies()
  return verifyVisitorCookie(jar.get(VISITOR_COOKIE)?.value, twinEnv().TWIN_COOKIE_SECRET)
}

/** Client IP as set by the reverse proxy (Easypanel/Traefik sets X-Forwarded-For). */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
