import { describe, expect, it } from 'vitest'
import { ConversationState, initialConversationState } from '../../src/contract/state'

describe('ConversationState', () => {
  it('builds a complete cold initial state', () => {
    const s = initialConversationState()
    expect(s.intent).toEqual({ score: 0, tier: 'cold', lastEvaluationId: null })
    expect(s.widgetShown).toBe(false)
    expect(s.callOfferDeclined).toBe(false)
    expect(s.booking).toEqual({ status: 'none' })
    expect(s.violations).toBe(0)
    expect(s.visitor).toEqual({})
  })

  it('rejects unknown tiers loudly', () => {
    const bad = { ...initialConversationState(), intent: { score: 1, tier: 'lukewarm', lastEvaluationId: null } }
    expect(() => ConversationState.parse(bad)).toThrow()
  })

  it('fills defaults for fields added after a row was written', () => {
    const legacy = { turnCount: 3 }
    const s = ConversationState.parse(legacy)
    expect(s.turnCount).toBe(3)
    expect(s.pendingApprovals).toEqual([])
  })
})
