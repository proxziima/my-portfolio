import type { AnalyticsEvents } from '@/lib/analytics/events'

/** A sent message as analytics sees it: its size and position, never its text (that is in the LLM trace). */
export function messageSentProps(text: string, previousVisitorTurns: number): AnalyticsEvents['twin_message_sent'] {
  return { chars: text.trim().length, turn: previousVisitorTurns + 1 }
}

interface ReplyLike {
  id: string
  role: string
  parts: ReadonlyArray<{ type: string; text?: string }>
}

/** Whether a twin message puts text on screen (`toLines` drops blank text). */
const showsText = (m: ReplyLike) => m.role === 'assistant' && m.parts.some((p) => p.type === 'text' && Boolean(p.text?.trim()))

/** The twin messages already showing text, taken at a send to tell this turn's reply from earlier ones. */
export function replyIds(messages: readonly ReplyLike[]): ReadonlySet<string> {
  return new Set(messages.filter(showsText).map((m) => m.id))
}

/**
 * Whether the twin's first text for the turn is on screen: a message with text that was not there at
 * the send. By message, not by line, so the previous reply streaming more paragraphs doesn't count.
 */
export function hasNewReply(messages: readonly ReplyLike[], before: ReadonlySet<string>): boolean {
  return messages.some((m) => showsText(m) && !before.has(m.id))
}
