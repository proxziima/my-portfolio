import { describe, expect, it } from 'vitest'
import { encodeNotice } from '@repo/twin/contract'
import { isParked, toLines } from '@/features/os/apps/messenger/parts'

const rendered = { status: 'rendered', calOrigin: 'https://cal.com', embedScriptUrl: 'https://app.cal.com/embed/embed.js', calLink: 'v/intro', bookingRef: 'r.s', ownerTimeZone: 'America/Sao_Paulo', visitorTimeZone: 'Europe/Lisbon' }

describe('toLines', () => {
  it('maps visitor text, twin text, the booking dialog and system notices', () => {
    const lines = toLines([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hey!' }, { type: 'dynamic-tool', toolName: 'schedule_call', toolCallId: 'c', state: 'output-available', input: {}, output: rendered }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: encodeNotice({ kind: 'booking.confirmed', startTime: '2026-10-08T14:00:00Z' }) }] },
    ])
    expect(lines.map((l) => l.kind)).toEqual(['text', 'text', 'booking', 'notice'])
    expect(lines[0]).toMatchObject({ from: 'viewer', text: 'hi' })
    expect(lines[1]).toMatchObject({ from: 'contact', text: 'hey!' })
  })

  it('ignores other tools, refused widgets and empty text', () => {
    const lines = toLines([{ id: 'a', role: 'assistant', parts: [{ type: 'text', text: '' }, { type: 'dynamic-tool', toolName: 'schedule_call', toolCallId: 'c', state: 'output-available', input: {}, output: { status: 'refused', reason: 'not_hot' } }, { type: 'dynamic-tool', toolName: 'search_portfolio', toolCallId: 'd', state: 'output-available', input: {}, output: null }] }])
    expect(lines).toEqual([])
  })
})

const ev = (type: string) => ({ type })

describe('isParked', () => {
  it('is parked while the latest turn-lifecycle event is a turn.waiting', () => {
    expect(isParked([ev('turn.started'), ev('step.started'), ev('message.appended'), ev('turn.waiting')])).toBe(true)
  })

  it('looks past events that do not move the turn along', () => {
    expect(isParked([ev('turn.started'), ev('turn.waiting'), ev('task.started'), ev('message.completed'), ev('input.requested')])).toBe(true)
  })

  it('is not parked once the turn produces text or a step again', () => {
    expect(isParked([ev('turn.waiting'), ev('message.appended')])).toBe(false)
    expect(isParked([ev('turn.waiting'), ev('step.started')])).toBe(false)
    expect(isParked([ev('turn.waiting'), ev('turn.started')])).toBe(false)
  })

  it('is not parked once the turn ends', () => {
    for (const end of ['turn.completed', 'turn.cancelled', 'turn.failed']) {
      expect(isParked([ev('turn.started'), ev('turn.waiting'), ev(end)])).toBe(false)
    }
  })

  it('is not parked without lifecycle events', () => {
    expect(isParked([])).toBe(false)
    expect(isParked([ev('session.started')])).toBe(false)
  })
})
