import type { ApprovalRecord, DecidedApproval } from '@repo/twin/db'
import { describe, expect, it } from 'vitest'
import { deliveryOutcome, planDecision, telegramActor } from '../agent/lib/telegram-decision'

const id = '3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'
const hook = 'https://agents.test/.well-known/workflow/v1/webhook/tok'
const tap = { status: 'approved' as const, fromId: '42' }

function decided(over: Partial<DecidedApproval> = {}): DecidedApproval {
  return {
    id,
    sessionId: 's',
    sourceId: 'knowledge:salary',
    status: 'approved',
    webhookUrl: hook,
    telegramMessageId: 7,
    decidedAt: new Date(),
    ...over,
  }
}

function stored(over: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id,
    sessionId: 's',
    sourceId: 'knowledge:salary',
    topic: 'salary',
    status: 'approved',
    webhookUrl: hook,
    telegramMessageId: 7,
    decidedAt: new Date(),
    actor: telegramActor('42'),
    ...over,
  }
}

describe('telegram decision plan', () => {
  it('delivers a freshly committed decision and marks the message', () => {
    expect(planDecision(tap, decided(), null)).toEqual({
      deliverTo: hook,
      answer: 'Approved',
      markText: 'Approved: knowledge:salary',
      error: null,
    })
    expect(
      planDecision({ ...tap, status: 'denied' }, decided({ status: 'denied' }), null).answer,
    ).toBe('Denied')
  })

  it('never throws when a committed decision has no webhook; it reports an error instead', () => {
    const plan = planDecision(tap, decided({ webhookUrl: null }), null)
    expect(plan.deliverTo).toBeNull()
    expect(plan.answer).toBe('Approved')
    expect(plan.error).toMatch(/no delivery webhook/)
  })

  it('re-delivers on a redelivery of the same decision by the same owner', () => {
    expect(planDecision(tap, null, stored())).toEqual({
      deliverTo: hook,
      answer: 'Already settled.',
      markText: 'Approved: knowledge:salary',
      error: null,
    })
    expect(planDecision(tap, null, stored({ webhookUrl: null })).error).toMatch(
      /no delivery webhook/,
    )
  })

  it('leaves anything else that was already settled alone', () => {
    const settled = { deliverTo: null, answer: 'Already settled.', markText: null, error: null }
    // The other button was tapped first.
    expect(planDecision(tap, null, stored({ status: 'denied' }))).toEqual(settled)
    // The deadline won.
    expect(planDecision(tap, null, stored({ status: 'expired', actor: 'system' }))).toEqual(settled)
    // Someone else decided it (never the owner's telegram id).
    expect(planDecision(tap, null, stored({ actor: telegramActor('7') }))).toEqual(settled)
    // Unknown approval id.
    expect(planDecision(tap, null, null)).toEqual(settled)
  })

  it('treats a hook that is no longer pending as nothing left to wake', () => {
    expect(deliveryOutcome(200)).toBe('delivered')
    expect(deliveryOutcome(202)).toBe('delivered')
    expect(deliveryOutcome(404)).toBe('gone')
    expect(deliveryOutcome(500)).toBe('failed')
    expect(deliveryOutcome(400)).toBe('failed')
  })
})
