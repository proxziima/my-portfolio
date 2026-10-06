/** An owner text, parsed: a decision (with or without a code) or anything else. */
export type OwnerReply =
  | { kind: 'decision'; status: 'approved' | 'denied'; code: string | null }
  | { kind: 'unrecognised' }

const APPROVE = new Set(['YES', 'Y', 'APPROVE', 'OK'])
const DENY = new Set(['NO', 'N', 'DENY'])

/** Strict, deterministic grammar: `<verb>` or `<verb> <code>`. No model reads owner texts, so nothing the owner (or a spoofed sender) types can be interpreted beyond these forms. */
export function parseOwnerReply(text: string): OwnerReply {
  const words = text.trim().toUpperCase().replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean)
  const [verb, code, ...rest] = words
  if (!verb || rest.length > 0) return { kind: 'unrecognised' }
  const status = APPROVE.has(verb) ? 'approved' : DENY.has(verb) ? 'denied' : null
  if (!status) return { kind: 'unrecognised' }
  if (code === undefined) return { kind: 'decision', status, code: null }
  return /^[A-Z0-9]{4}$/.test(code) ? { kind: 'decision', status, code } : { kind: 'unrecognised' }
}

/** The approval prompt, built from the stored row only (never the model's reason; spec §6). */
export function requestText(row: { topic: string; sourceId: string; replyCode: string }, timeout: string): string {
  return `Twin approval request\nTopic: ${row.topic}\nItem: ${row.sourceId}\nReply YES ${row.replyCode} to share or NO ${row.replyCode} to decline. Auto-denies after ${timeout}.`
}

/** The reply to a decision that was just recorded (or redelivered). */
export function confirmationText(status: 'approved' | 'denied' | 'expired', code: string, topic: string): string {
  if (status === 'approved') return `Approved ${code}: ${topic}.`
  if (status === 'denied') return `Denied ${code}: ${topic}. Nothing was shared.`
  return lateReplyText('expired', code)
}

/** The reply when the code was already settled some other way. */
export function lateReplyText(status: 'approved' | 'denied' | 'expired', code: string): string {
  return status === 'expired' ? `${code} already expired; nothing was shared.` : `${code} was already ${status}.`
}

/** The reply to a code that matches nothing. */
export function unknownCodeText(code: string): string {
  return `No approval ${code} is waiting.`
}

/** The reply to anything unparseable or ambiguous, listing what is waiting. */
export function helpText(pending: readonly { replyCode: string; topic: string }[]): string {
  if (pending.length === 0) return 'Nothing is waiting for approval.'
  const shown = pending.slice(0, 3).map((p) => `${p.replyCode} (${p.topic})`).join(', ')
  const more = pending.length > 3 ? `, and ${pending.length - 3} more` : ''
  return `Reply YES <code> or NO <code>. Waiting: ${shown}${more}.`
}
