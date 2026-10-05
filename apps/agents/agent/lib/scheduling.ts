import type { ConversationState, ScheduleTrigger } from '@repo/twin/contract'

/** Whether `schedule_call` may show the booking dialog, and why not when it may not. */
export type ScheduleDecision = { render: true } | { render: false; reason: 'already_shown' | 'not_hot' }

/**
 * The widget's only guards. The trigger itself is decided elsewhere: the evaluator for
 * `hot_tier`, the visitor's own words for `explicit_request` (spec §5.2, §6).
 */
export function decideScheduleCall(s: ConversationState, trigger: ScheduleTrigger): ScheduleDecision {
  if (s.widgetShown) return { render: false, reason: 'already_shown' }
  if (trigger === 'hot_tier' && s.intent.tier !== 'hot') return { render: false, reason: 'not_hot' }
  return { render: true }
}
