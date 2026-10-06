import { describe, expect, it } from 'vitest'
import { ConversationState, initialConversationState } from '@repo/twin/contract'
import { callDirective, stateDigest } from '../agent/lib/state-digest'

const s = (patch: Partial<ConversationState>): ConversationState => ({ ...initialConversationState(), ...patch })
const tier = (t: 'cold' | 'warm' | 'hot') => ({ score: 0, tier: t, lastEvaluationId: null })

describe('callDirective', () => {
  it('maps each state to exactly one directive', () => {
    expect(callDirective(s({ intent: tier('cold') }))).toMatch(/^cold:/)
    expect(callDirective(s({ intent: tier('warm') }))).toMatch(/^warm:.*offer/)
    expect(callDirective(s({ intent: tier('warm'), turnCount: 4, callOfferTurn: 3 }))).toMatch(/^warm-offered:/)
    expect(callDirective(s({ intent: tier('hot') }))).toMatch(/^hot:.*hot_tier/)
    expect(callDirective(s({ intent: tier('hot'), widgetShown: true }))).toMatch(/^shown:/)
    expect(callDirective(s({ intent: tier('hot'), callOfferDeclined: true }))).toMatch(/^declined:/)
    expect(callDirective(s({ booking: { status: 'confirmed', startTime: '2026-10-08T14:00:00Z' } }))).toMatch(/^booked:/)
  })
})

describe('the hot directive', () => {
  const hot = callDirective(s({ intent: tier('hot') }))

  // A hot tier once made the model open the dialog before answering a technical question.
  it('answers the visitor first and makes schedule_call the last action of the reply', () => {
    expect(hot).toMatch(/^hot: answer the visitor's message first/)
    expect(hot).toMatch(/then call schedule_call \(trigger hot_tier\) as the last action of this reply/)
    expect(hot.indexOf('answer')).toBeLessThan(hot.indexOf('schedule_call'))
  })

  it('introduces the dialog in one short line, never instead of the answer', () => {
    expect(hot).toMatch(/introduce it in one short line/)
    expect(hot).toMatch(/never instead of the answer/)
  })

  it('fits the 600-character digest with every other field at its maximum', () => {
    const state = ConversationState.parse({
      turnCount: 99_999,
      returningVisitor: true,
      visitor: { name: 'n'.repeat(80), company: 'c'.repeat(120), role: 'r'.repeat(120), kind: 'hiring_manager', technical: false },
      intent: { score: 99, tier: 'hot', lastEvaluationId: null },
      pendingApprovals: Array.from({ length: 999 }, (_, i) => ({ approvalId: `a${i}`, sourceId: `knowledge:${i}`, topic: 't' })),
      citedSources: Array.from({ length: 50 }, (_, i) => `${'x'.repeat(200)}:${i}`),
    })
    const d = stateDigest(state)
    expect(d).toContain(`call: ${hot}`)
    expect(d.length).toBeLessThanOrEqual(600)
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

  it('re-issues the warm offer when a step of the offer turn is replayed', () => {
    expect(callDirective(s({ intent: tier('warm'), turnCount: 3, callOfferTurn: 3 }))).toMatch(/^warm:/)
    expect(callDirective(s({ intent: tier('warm'), turnCount: 4, callOfferTurn: 3 }))).toMatch(/^warm-offered:/)
  })

  it('stays within 600 characters with every field at its maximum', () => {
    const state = ConversationState.parse({
      turnCount: 99_999,
      returningVisitor: true,
      visitor: { name: 'n'.repeat(80), company: 'c'.repeat(120), role: 'r'.repeat(120), kind: 'hiring_manager', technical: false },
      intent: { score: 99, tier: 'warm', lastEvaluationId: null },
      booking: { status: 'rescheduled', uid: 'u', startTime: '2026-10-08T14:00:00.123456789+05:30' },
      pendingApprovals: Array.from({ length: 999 }, (_, i) => ({ approvalId: `a${i}`, sourceId: `knowledge:${i}`, topic: 't' })),
      citedSources: Array.from({ length: 50 }, (_, i) => `${'x'.repeat(200)}:${i}`),
    })
    const d = stateDigest(state)
    expect(d.length).toBeLessThanOrEqual(600)
    expect(d.endsWith('</conversation_state>')).toBe(true)
    expect(/visitor: (.*)/.exec(d)?.[1]?.replace(' (returning)', '').length).toBeLessThanOrEqual(160)
  })
})
