import 'server-only'
import { safeHref } from '@/shared/ui/chip-markup'
import { secretsMatch } from '@/lib/security/secrets'
import { cmsBaseUrl } from './client'

/** Payload's auth cookie: `${cookiePrefix}-token`, and payload.config.ts keeps the default prefix `payload`. */
export const PAYLOAD_TOKEN_COOKIE = 'payload-token'

/** Uncached CMS calls (session check, draft read) give up after this, so a hung CMS can't hang the page. */
export const CMS_TIMEOUT_MS = 5000

export const isPreviewSecret = (provided: string | null | undefined): boolean =>
  secretsMatch(provided, process.env.PREVIEW_SECRET)

// Same rules as Payload's `getSafeRedirect` (payload/shared), on top of `safeHref`'s charset rules.
const AMBIGUOUS_PREFIX = /^\/%(?:25)*(?:09|0a|0d|2f|5c)/i
const SCHEME_LIKE_PREFIX = /^\/(?:javascript:|http)/i

/** A same-origin relative path ("/blog/a"): no protocol-relative, backslash, encoded-slash or scheme tricks. */
export function isSafePreviewPath(path: string | null | undefined): path is string {
  if (!path || safeHref(path) !== path) return false
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return false
  if (AMBIGUOUS_PREFIX.test(path) || SCHEME_LIKE_PREFIX.test(path)) return false
  try {
    return new URL(path, 'http://localhost').origin === 'http://localhost'
  } catch {
    return false
  }
}

/** The value of one cookie from a raw `Cookie` header. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [key, ...rest] = part.split('=')
    if (key?.trim() === name) return rest.join('=').trim() || undefined
  }
  return undefined
}

export interface PreviewUser { id: string }

/**
 * Asks the CMS who owns the admin session. Only the Payload token cookie is forwarded, never the
 * rest of the web app's cookies. Any failure (no cookie, CMS down, expired token) means "nobody".
 */
export async function getPreviewUser(cookieHeader: string | null | undefined): Promise<PreviewUser | null> {
  const token = readCookie(cookieHeader, PAYLOAD_TOKEN_COOKIE)
  if (!token) return null
  try {
    const res = await fetch(new URL('/api/users/me', cmsBaseUrl()), {
      headers: { cookie: `${PAYLOAD_TOKEN_COOKIE}=${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(CMS_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { user?: { id?: number | string } | null }
    const id = body.user?.id
    return id === undefined || id === null ? null : { id: String(id) }
  } catch {
    return null
  }
}
