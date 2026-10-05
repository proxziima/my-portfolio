import type { ConversationState } from '@repo/twin/contract'

/** Field caps that keep the digest within its 600-character budget (spec §8). */
const WHO_MAX = 160
const START_MAX = 40
const CITED_MAX = 120

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/**
 * The single call directive for this turn. The tier was decided by the evaluator after the
 * previous reply; the model only phrases it (spec §7). Order matters: earlier rules win.
 */
export function callDirective(s: ConversationState): string {
  if (s.booking.status === 'confirmed' || s.booking.status === 'rescheduled') {
    return `booked: a call is booked${s.booking.startTime ? ` for ${clip(s.booking.startTime, START_MAX)}` : ''}. Acknowledge it once, warmly, if you haven't yet. Don't offer another call.`
  }
  if (s.booking.status === 'cancelled') return 'cancelled: the visitor cancelled the booked call. Don’t raise it unless they do.'
  if (s.widgetShown) return 'shown: the booking dialog is already in the chat. Refer to it if relevant; never show it again.'
  if (s.callOfferDeclined) return 'declined: the visitor declined a call. Never offer again unless they explicitly ask.'
  if (s.intent.tier === 'hot') return 'hot: call schedule_call with trigger hot_tier in this reply and introduce it in one short line.'
  if (s.intent.tier === 'warm') {
    // Keyed to the offer turn, so a replayed step of that turn re-issues the same directive.
    return s.callOfferTurn === null || s.callOfferTurn === s.turnCount
      ? 'warm: end this reply with one natural, in-character line offering a short call. No dialog yet.'
      : 'warm-offered: you already offered a call once. Don’t repeat the offer.'
  }
  return 'cold: don’t mention calls, booking or availability unless the visitor asks.'
}

/** Compact state summary injected each turn instead of replaying raw history; at most 600 chars (spec §8). */
export function stateDigest(s: ConversationState): string {
  const v = s.visitor
  const who = [v.name, v.role && `${v.role}`, v.company && `at ${v.company}`, v.kind, v.technical === undefined ? undefined : v.technical ? 'technical' : 'non-technical']
    .filter(Boolean)
    .join(', ')
  const lines = [
    '<conversation_state>',
    `turn: ${s.turnCount}`,
    `visitor: ${clip(who, WHO_MAX) || 'unknown'}${s.returningVisitor ? ' (returning)' : ''}`,
    `call: ${callDirective(s)}`,
    s.pendingApprovals.length > 0 ? `pending checks: ${s.pendingApprovals.length} (never mention them)` : null,
    s.citedSources.length > 0 ? `already cited: ${clip(s.citedSources.slice(-6).join(', '), CITED_MAX)}` : null,
    '</conversation_state>',
  ]
  return lines.filter((l) => l !== null).join('\n')
}
