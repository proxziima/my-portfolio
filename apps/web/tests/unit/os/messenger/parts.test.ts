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

  // The model may call schedule_call before it writes; the answer still reads first, the widget last.
  it("puts a message's booking dialog after its text, whatever the part order, with the same ids", () => {
    const lines = toLines([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Como você refatora código legado?' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'dynamic-tool', toolName: 'schedule_call', toolCallId: 'c', state: 'output-available', input: {}, output: rendered },
          { type: 'text', text: 'Primeiro cubro com testes de caracterização.\n\nDepois extraio por partes.' },
          { type: 'text', text: 'Se quiser, marca um horário aí embaixo.' },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'valeu' }] },
    ])
    expect(lines.map((l) => [l.kind, l.id])).toEqual([
      ['text', 'u1:0'],
      ['text', 'a1:1:0'],
      ['text', 'a1:1:1'],
      ['text', 'a1:2:0'],
      ['booking', 'a1:0'],
      ['text', 'u2:0'],
    ])
  })

  it('keeps the booking dialog last while the text after it streams in', () => {
    const tool = { type: 'dynamic-tool', toolName: 'schedule_call', toolCallId: 'c', state: 'output-available', input: {}, output: rendered }
    for (const text of ['', 'Pri', 'Primeiro\n\nDepois']) {
      const lines = toLines([{ id: 'a1', role: 'assistant', parts: [tool, { type: 'text', text }] }])
      expect(lines.at(-1)).toMatchObject({ kind: 'booking', id: 'a1:0' })
    }
  })

  it('splits a twin reply into one line per paragraph, with ids stable per paragraph', () => {
    const lines = toLines([{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'Oi, tudo bom?\n\nTenho sim, pode falar\n\n\nÉ sobre alguma vaga?' }] }])
    expect(lines).toEqual([
      { kind: 'text', id: 'm1:0:0', from: 'contact', text: 'Oi, tudo bom?' },
      { kind: 'text', id: 'm1:0:1', from: 'contact', text: 'Tenho sim, pode falar' },
      { kind: 'text', id: 'm1:0:2', from: 'contact', text: 'É sobre alguma vaga?' },
    ])
  })

  it('keeps line ids prefix-stable and never emits an empty line while a reply streams', () => {
    const steps = ['Oi', 'Oi\n', 'Oi\n\n', 'Oi\n\nTenho', 'Oi\n\nTenho sim']
    const idsAt = steps.map((text) => {
      const lines = toLines([{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text }] }])
      for (const l of lines) expect(l.kind === 'text' && l.text.trim() !== '').toBe(true)
      return lines.map((l) => l.id)
    })
    // Each step's ids start with the previous step's ids: earlier lines are never re-keyed.
    idsAt.forEach((ids, i) => {
      if (i > 0) expect(ids.slice(0, idsAt[i - 1]!.length)).toEqual(idsAt[i - 1])
    })
    expect(idsAt[0]).toEqual(['m1:0:0'])
    expect(idsAt[2]).toEqual(['m1:0:0'])
    expect(idsAt.at(-1)).toEqual(['m1:0:0', 'm1:0:1'])
    const last = toLines([{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: steps.at(-1)! }] }])
    expect(last.map((l) => (l.kind === 'text' ? l.text : null))).toEqual(['Oi', 'Tenho sim'])
  })

  it('keeps single line breaks inside a paragraph and never splits visitor text', () => {
    const lines = toLines([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'linha um\n\nlinha dois' }] },
      { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'a\nb' }] },
    ])
    expect(lines.map((l) => (l.kind === 'text' ? l.text : null))).toEqual(['linha um\n\nlinha dois', 'a\nb'])
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
