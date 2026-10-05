import type { ApprovalRecord, DecidedApproval } from '@repo/twin/db'
import { describe, expect, it } from 'vitest'
import { OWNER_ACTOR, planDecision } from '../agent/lib/owner-decision'

const id = '3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f'
const hook = 'https://agents.test/.well-known/workflow/v1/webhook/tok'

function decided(over: Partial<DecidedApproval> = {}): DecidedApproval {
  return {
    id,
    sessionId: 's',
    sourceId: 'knowledge:salary',
    status: 'approved',
    topic: 'Notice period',
    replyCode: 'K7Q2',
    webhookUrl: hook,
    decidedAt: new Date(),
    ...over,
  }
}

function stored(over: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id,
    sessionId: 's',
    sourceId: 'knowledge:salary',
    topic: 'Notice period',
    status: 'approved',
    webhookUrl: hook,
    replyCode: 'K7Q2',
    notifiedAt: new Date(),
    decidedAt: new Date(),
    actor: OWNER_ACTOR,
    ...over,
  }
}

describe('owner decision plan', () => {
  it('delivers a freshly committed decision and confirms it to the owner', () => {
    expect(planDecision('approved', decided(), null)).toEqual({
      deliverTo: hook,
      reply: 'Approved K7Q2: Notice period.',
      error: null,
    })
    expect(planDecision('denied', decided({ status: 'denied' }), null).reply).toBe(
      'Denied K7Q2: Notice period. Nothing was shared.',
    )
  })

  it('never throws when a committed decision has no webhook; it reports an error instead', () => {
    const plan = planDecision('approved', decided({ webhookUrl: null }), null)
    expect(plan.deliverTo).toBeNull()
    expect(plan.reply).toBe('Approved K7Q2: Notice period.')
    expect(plan.error).toMatch(/no delivery webhook/)
  })

  it('re-delivers on a repeat of the same decision by the owner', () => {
    expect(planDecision('approved', null, stored())).toEqual({
      deliverTo: hook,
      reply: 'Approved K7Q2: Notice period.',
      error: null,
    })
    expect(planDecision('approved', null, stored({ webhookUrl: null })).error).toMatch(/no delivery webhook/)
  })

  it('leaves anything else that was already settled alone, saying how it settled', () => {
    // The opposite answer came first.
    expect(planDecision('approved', null, stored({ status: 'denied' }))).toEqual({
      deliverTo: null,
      reply: 'K7Q2 was already denied.',
      error: null,
    })
    // Someone else decided it (never the owner's number).
    expect(planDecision('approved', null, stored({ actor: 'imessage:other' }))).toEqual({
      deliverTo: null,
      reply: 'K7Q2 was already approved.',
      error: null,
    })
  })

  it('tells the owner when the deadline won, without delivering anything', () => {
    expect(planDecision('approved', null, stored({ status: 'expired', actor: 'system' }))).toEqual({
      deliverTo: null,
      reply: 'K7Q2 already expired; nothing was shared.',
      error: null,
    })
  })

  it('asks to try again when the row is missing or still pending', () => {
    const nothing = { deliverTo: null, reply: 'Nothing changed. Try again.', error: null }
    expect(planDecision('approved', null, null)).toEqual(nothing)
    expect(planDecision('approved', null, stored({ status: 'pending', actor: null, decidedAt: null }))).toEqual(nothing)
  })
})
