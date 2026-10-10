import type { AnalyticsEvents } from '@/lib/analytics/events'

/** A sent message as analytics sees it: its size and position, never its text (that is in the LLM trace). */
export function messageSentProps(text: string, previousVisitorTurns: number): AnalyticsEvents['twin_message_sent'] {
  return { chars: text.trim().length, turn: previousVisitorTurns + 1 }
}
