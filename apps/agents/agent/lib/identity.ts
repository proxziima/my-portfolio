import { isTimeZone } from '@repo/twin/env'
import { isUuid } from './uuid'

/** The subset of eve's SessionAuthContext the twin reads. */
export interface Principal {
  principalType: string
  principalId: string
  authenticator: string
  attributes: Readonly<Record<string, string | readonly string[]>>
}

/** Fixed visitor for `eve dev` and offline evals, created on demand like any other visitor. */
export const DEV_VISITOR_ID = '00000000-0000-4000-8000-000000000001'

/** The visitor behind a principal, or null for non-visitors (webhooks, schedules). */
export function visitorIdOf(p: Principal | null | undefined): string | null {
  if (!p) return null
  if (p.principalType === 'local-dev') return DEV_VISITOR_ID
  if (p.principalType !== 'user' || !p.principalId.startsWith('web:')) return null
  const id = p.principalId.slice(4)
  return isUuid(id) ? id : null
}

/** The visitor's IANA zone from the JWT `tz` claim, or null when absent or invalid. */
export function visitorTimeZoneOf(p: Principal | null | undefined): string | null {
  const tz = p?.attributes.tz
  return typeof tz === 'string' && isTimeZone(tz) ? tz : null
}
