import { describe, expect, it } from 'vitest'
import { initialConversationState } from '@repo/twin/contract'
import { decideScheduleCall } from '../agent/lib/scheduling'

const s = initialConversationState()
const hot = { ...s, intent: { score: 9, tier: 'hot' as const, lastEvaluationId: 'e1' } }

describe('decideScheduleCall', () => {
  it('renders on explicit request even when cold, and only once', () => {
    expect(decideScheduleCall(s, 'explicit_request')).toEqual({ render: true })
    expect(decideScheduleCall({ ...s, widgetShown: true }, 'explicit_request')).toEqual({ render: false, reason: 'already_shown' })
  })

  it('renders on hot_tier only when the evaluator said hot', () => {
    expect(decideScheduleCall(s, 'hot_tier')).toEqual({ render: false, reason: 'not_hot' })
    expect(decideScheduleCall(hot, 'hot_tier')).toEqual({ render: true })
  })
})
