/** The visitor's PostHog identity as the browser SDK stored it. */
export interface PostHogIds {
  distinctId: string
  /** The current replay/web-analytics session, when the SDK has started one. */
  sessionId: string | null
}

/** Longer than any id posthog-js generates (UUIDv7 = 36 chars): a forged or corrupt cookie. */
const MAX_ID = 200

const id = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 && value.length <= MAX_ID ? value : null)

/**
 * Reads `ph_<token>_posthog` (URI-encoded JSON: `distinct_id`, `$sesid: [lastActivity, id, start]`)
 * from a Cookie header. Never throws: a missing or malformed cookie just means no identity.
 */
export function posthogIdsFromCookie(cookieHeader: string | null | undefined, token: string): PostHogIds | null {
  if (!cookieHeader) return null
  const name = `ph_${token}_posthog=`
  const raw = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name))
    ?.slice(name.length)
  if (!raw) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { distinct_id?: unknown; $sesid?: unknown }
    const distinctId = id(parsed.distinct_id)
    if (!distinctId) return null
    const sessionId = Array.isArray(parsed.$sesid) ? id(parsed.$sesid[1]) : null
    return { distinctId, sessionId }
  } catch {
    return null
  }
}
