import type { Endpoint } from 'payload'
import { secretsMatch } from '../security/secrets'

/** Builds the BFF's redaction rules: never-tier terms plus public contact values to keep. */
export function redactTermsResponse(
  neverEntries: ReadonlyArray<{ redactTerms?: ReadonlyArray<{ term: string }> | null }>,
  profile: { email?: string | null },
  links: ReadonlyArray<{ url?: string | null }>,
): { terms: string[]; allow: string[] } {
  const terms = neverEntries.flatMap((e) => (e.redactTerms ?? []).map((t) => t.term.trim())).filter((t) => t.length > 0)
  const mails = links.map((l) => l.url ?? '').filter((u) => u.startsWith('mailto:')).map((u) => u.slice('mailto:'.length))
  const allow = [profile.email ?? '', ...mails].filter((v) => v.length > 0)
  return { terms: [...new Set(terms)], allow: [...new Set(allow)] }
}

/** GET /api/twin/redact-terms. Only the web BFF holds TWIN_REDACT_SECRET. */
export const redactTermsEndpoint: Endpoint = {
  path: '/twin/redact-terms',
  method: 'get',
  handler: async (req) => {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer /, '')
    if (!secretsMatch(bearer, process.env.TWIN_REDACT_SECRET)) return Response.json({ ok: false }, { status: 401 })
    const [never, profile, contact] = await Promise.all([
      req.payload.find({ collection: 'knowledge', where: { disclosure: { equals: 'never' } }, limit: 1000, depth: 0, overrideAccess: true, pagination: false }),
      req.payload.findGlobal({ slug: 'profile', depth: 0, overrideAccess: true }),
      req.payload.findGlobal({ slug: 'contact', depth: 0, overrideAccess: true }),
    ])
    return Response.json(redactTermsResponse(never.docs, profile, contact.links ?? []), { headers: { 'cache-control': 'no-store' } })
  },
}
