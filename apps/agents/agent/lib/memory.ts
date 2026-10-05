import type { VisitorHistory } from '@repo/twin/db'
import { untrusted } from './untrusted'

/** The recalled note for a returning visitor: facts only, never transcripts. */
export function recallText(h: VisitorHistory, key: string): string {
  const facts = [
    `${h.visits} earlier visit${h.visits === 1 ? '' : 's'}`,
    h.name ? `name: ${h.name}` : null,
    h.company ? `company: ${h.company}` : null,
    h.role ? `role: ${h.role}` : null,
    h.kind ? `kind: ${h.kind}` : null,
    h.topics.length > 0 ? `talked about: ${h.topics.join(', ')}` : null,
    h.booked ? 'booked a call before' : null,
    h.declinedCall ? 'declined a call before' : null,
  ].filter(Boolean)
  return `Returning visitor.\n${untrusted('memory', facts.join('\n'), key)}`
}
