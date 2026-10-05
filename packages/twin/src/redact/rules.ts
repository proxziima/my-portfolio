import { z } from 'zod'
import type { RedactionRules } from './redact'

const RulesResponse = z.object({ terms: z.array(z.string()), allow: z.array(z.string()) })
const TTL_MS = 5 * 60_000

let cached: { at: number; rules: RedactionRules } | null = null

/**
 * Never-tier terms and allow-listed contact values from `GET /api/twin/redact-terms`, memoised for
 * five minutes. A failed fetch throws: redaction must never silently run without its terms.
 */
export async function fetchRedactionRules(cmsUrl: string, secret: string, now = Date.now()): Promise<RedactionRules> {
  if (cached && now - cached.at < TTL_MS) return cached.rules
  const res = await fetch(new URL('/api/twin/redact-terms', cmsUrl), {
    headers: { authorization: `Bearer ${secret}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`redact-terms responded ${res.status}`)
  const rules = RulesResponse.parse(await res.json())
  cached = { at: now, rules }
  return rules
}

/** Test seam: forget the memoised rules. */
export function resetRedactionRulesCache(): void {
  cached = null
}
