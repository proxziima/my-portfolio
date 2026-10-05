import { z } from 'zod'
import type { RedactionRules } from './redact'

const RulesResponse = z.object({ terms: z.array(z.string()), allow: z.array(z.string()) })
const TTL_MS = 5 * 60_000
/** A request that takes longer than this is aborted and counts as a failure. */
const FETCH_TIMEOUT_MS = 3_000
/** After a failure, no new fetch is attempted for this long. */
const FAILURE_BACKOFF_MS = 30_000
/** After a failure, the last good rules are served only while they are younger than this. */
const MAX_STALE_MS = 60 * 60_000

let cached: { at: number; rules: RedactionRules } | null = null
let failure: { at: number; error: unknown } | null = null

/**
 * Never-tier terms and allow-listed contact values from `GET /api/twin/redact-terms`, memoised for
 * five minutes. It runs on every message and stream, so each request times out after three seconds,
 * and after a failure it stops fetching for thirty seconds and serves the last good rules while they
 * are under an hour old. With no usable rules it throws (during the backoff too): redaction must
 * never silently run without its terms.
 */
export async function fetchRedactionRules(cmsUrl: string, secret: string, now = Date.now()): Promise<RedactionRules> {
  if (cached && now - cached.at < TTL_MS) return cached.rules
  if (failure && now - failure.at < FAILURE_BACKOFF_MS) return lastGoodOr(failure.error, now)
  try {
    const res = await fetch(new URL('/api/twin/redact-terms', cmsUrl), {
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`redact-terms responded ${res.status}`)
    const rules = RulesResponse.parse(await res.json())
    cached = { at: now, rules }
    failure = null
    return rules
  } catch (error) {
    failure = { at: now, error }
    return lastGoodOr(error, now)
  }
}

function lastGoodOr(error: unknown, now: number): RedactionRules {
  if (cached && now - cached.at < MAX_STALE_MS) return cached.rules
  throw error
}

/** Test seam: forget the memoised rules and any recorded failure. */
export function resetRedactionRulesCache(): void {
  cached = null
  failure = null
}
