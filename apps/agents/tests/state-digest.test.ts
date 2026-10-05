import { describe, expect, it } from 'vitest'
import { initialConversationState, type ConversationState } from '@repo/twin/contract'
import { callDirective, stateDigest } from '../agent/lib/state-digest'

const s = (patch: Partial<ConversationState>): ConversationState => ({ ...initialConversationState(), ...patch })
const tier = (t: 'cold' | 'warm' | 'hot') => ({ score: 0, tier: t, lastEvaluationId: null })

describe('callDirective', () => {
  it('maps each state to exactly one directive', () => {
    expect(callDirective(s({ intent: tier('cold') }))).toMatch(/^cold:/)
    expect(callDirective(s({ intent: tier('warm') }))).toMatch(/^warm:.*offer/)
    expect(callDirective(s({ intent: tier('warm'), callOfferMade: true }))).toMatch(/^warm-offered:/)
    expect(callDirective(s({ intent: tier('hot') }))).toMatch(/^hot:.*hot_tier/)
    expect(callDirective(s({ intent: tier('hot'), widgetShown: true }))).toMatch(/^shown:/)
    expect(callDirective(s({ intent: tier('hot'), callOfferDeclined: true }))).toMatch(/^declined:/)
    expect(callDirective(s({ booking: { status: 'confirmed', startTime: '2026-10-08T14:00:00Z' } }))).toMatch(/^booked:/)
  })
})

describe('stateDigest', () => {
  it('is compact and never leaks raw history', () => {
    const d = stateDigest(s({ turnCount: 5, visitor: { name: 'Ana', company: 'Acme', kind: 'recruiter', technical: false }, citedSources: ['projects:1'] }))
    expect(d.length).toBeLessThanOrEqual(600)
    expect(d).toContain('Ana')
    expect(d.startsWith('<conversation_state>')).toBe(true)
  })

  it('mentions pending checks only as a count with a do-not-mention rule', () => {
    const d = stateDigest(s({ pendingApprovals: [{ approvalId: 'a', sourceId: 'knowledge:1', topic: 'Notice period' }] }))
    expect(d).toContain('pending checks: 1 (never mention them)')
    expect(d).not.toContain('Notice period')
  })

  it('instructs the warm offer on the turn it is first marked', () => {
    const before = s({ intent: tier('warm') })
    expect(stateDigest(before)).toContain('warm: end this reply')
  })
})
