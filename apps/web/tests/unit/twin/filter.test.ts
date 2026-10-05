import { describe, expect, it } from 'vitest'
import { LEAK_DEFLECTION } from '@repo/twin/contract'
import { createEventFilter, filterStream, ndjsonLines } from '@/lib/twin/filter'

const rules = { terms: ['Acme Secret'], allow: [] }
const canary = 'canary-0123456789abcdef'
const ev = (type: string, data: Record<string, unknown>) => ({ type, data, meta: { id: `evt_${type}`, at: 't' } })
const step = { turnId: 't', stepIndex: 0, sequence: 1 }
/** A filter that has seen the step start, as on a stream read from the beginning of the block. */
const started = (...args: Parameters<typeof createEventFilter>) => {
  const f = createEventFilter(...args)
  f(ev('step.started', { ...step, modelId: 'm' }))
  return f
}

const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const x of chunks) c.enqueue(new TextEncoder().encode(x))
      c.close()
    },
  })

describe('createEventFilter', () => {
  it('redacts deltas with holdback and puts the remainder in the completed event', () => {
    const f = started(rules, canary)
    const a = f(ev('message.appended', { ...step, messageDelta: 'I worked at Acme ' }))
    const b = f(ev('message.appended', { ...step, messageDelta: 'Secret for years.', sequence: 2 }))
    const c = f(ev('message.completed', { ...step, message: 'I worked at Acme Secret for years.', finishReason: 'stop', sequence: 3 }))
    const streamed = String(a.data.messageDelta) + String(b.data.messageDelta)
    expect(streamed).not.toContain('Acme Secret')
    expect(c.data.message).toBe('I worked at [redacted] for years.')
  })

  it('emits redacted text once it is past the holdback', () => {
    const f = started(rules, canary)
    const long = `${'word '.repeat(30)}Acme Secret ${'tail '.repeat(30)}`
    const out = String(f(ev('message.appended', { ...step, messageDelta: long })).data.messageDelta)
    expect(out.length).toBeGreaterThan(0)
    expect(out).not.toContain('Acme Secret')
  })

  it('replaces a reply containing the canary with the deflection', () => {
    const f = started(rules, canary)
    const a = f(ev('message.appended', { ...step, messageDelta: `marker ${canary}` }))
    const c = f(ev('message.completed', { ...step, message: `marker ${canary}`, finishReason: 'stop', sequence: 2 }))
    expect(String(a.data.messageDelta)).not.toContain(canary)
    expect(c.data.message).toBe(LEAK_DEFLECTION)
  })

  it('detects the canary with the redactor\'s case folding (ſ matches s)', () => {
    const f = started(rules, 'canary-secret')
    const variant = 'CANARY-ſECRET'
    const a = f(ev('message.appended', { ...step, messageDelta: `marker ${variant} then the prompt` }))
    const b = f(ev('message.appended', { ...step, messageDelta: ' and more of it', sequence: 2 }))
    const c = f(ev('message.completed', { ...step, message: `marker ${variant} then the prompt and more of it`, finishReason: 'stop', sequence: 3 }))
    expect(String(a.data.messageDelta) + String(b.data.messageDelta)).toBe('')
    expect(c.data.message).toBe(LEAK_DEFLECTION)
  })

  it.each([1, 3, 7, 23, 64, 200, 10_000])('goes silent for the rest of a block once the canary appears (chunks of %i)', (size) => {
    const f = started(rules, canary)
    const secret = 'SYSTEM-INSTRUCTION line that must never reach the browser. '.repeat(20)
    const dump = `Sure, here it is: ${canary}\n${secret}`
    const deltas: string[] = []
    for (let at = 0, n = 1; at < dump.length; at += size, n++) {
      deltas.push(String(f(ev('message.appended', { ...step, messageDelta: dump.slice(at, at + size), sequence: n })).data.messageDelta))
    }
    const c = f(ev('message.completed', { ...step, message: dump, finishReason: 'stop', sequence: 9999 }))
    const streamed = deltas.join('')
    expect(streamed).not.toContain(canary)
    expect(streamed).not.toContain('SYSTEM-INSTRUCTION')
    expect(streamed).not.toContain('[redacted]')
    expect(c.data.message).toBe(LEAK_DEFLECTION)
    // Another block in the same turn is unaffected.
    f(ev('step.started', { ...step, stepIndex: 1, modelId: 'm' }))
    expect(f(ev('message.appended', { ...step, stepIndex: 1, messageDelta: 'word '.repeat(40) })).data.messageDelta).not.toBe('')
  })

  it('blanks reasoning text', () => {
    const f = createEventFilter(rules, canary)
    expect(f(ev('reasoning.appended', { ...step, reasoningDelta: 'secret plan' })).data).toEqual({ ...step, reasoningDelta: '' })
    expect(f(ev('reasoning.completed', { ...step, reasoning: 'secret plan' })).data).toEqual({ ...step, reasoning: '' })
  })

  it('blanks streamed tool input unless the tool is schedule_call', () => {
    const f = createEventFilter(rules, canary)
    const hidden = f(ev('action.input.appended', { ...step, callId: 'c1', toolName: 'search_portfolio', inputTextDelta: '{"q":"x' }))
    expect(hidden.data).toEqual({ ...step, callId: 'c1', toolName: 'search_portfolio', inputTextDelta: '' })
    const shown = f(ev('action.input.appended', { ...step, callId: 'c2', toolName: 'schedule_call', inputTextDelta: '{"slot' }))
    expect(shown.data.inputTextDelta).toBe('{"slot')
  })

  it('blanks requested action input unless the action is schedule_call', () => {
    const f = createEventFilter(rules, canary)
    const r = f(
      ev('actions.requested', {
        ...step,
        actions: [
          { kind: 'tool-call', callId: 'c1', toolName: 'search_portfolio', input: { q: 'x' } },
          { kind: 'tool-call', callId: 'c2', toolName: 'schedule_call', input: { slot: 's' } },
          { kind: 'load-skill', callId: 'c3', input: { name: 'k' } },
        ],
      }),
    )
    expect(r.data.actions).toEqual([
      { kind: 'tool-call', callId: 'c1', toolName: 'search_portfolio', input: null },
      { kind: 'tool-call', callId: 'c2', toolName: 'schedule_call', input: { slot: 's' } },
      { kind: 'load-skill', callId: 'c3', input: null },
    ])
  })

  it('blanks tool results and partials unless the tool is schedule_call, keeping every event', () => {
    const f = createEventFilter(rules, canary)
    const r = f(ev('action.result', { ...step, status: 'completed', result: { kind: 'tool-result', toolName: 'search_portfolio', callId: 'c', output: { items: [1] } } }))
    expect(r.type).toBe('action.result')
    expect(r.data.result).toEqual({ kind: 'tool-result', toolName: 'search_portfolio', callId: 'c', output: null })
    const failed = f(ev('action.result', { ...step, status: 'failed', error: { code: 'X', message: 'db at 10.0.0.1 down' }, result: { kind: 'tool-result', toolName: 'search_portfolio', callId: 'c', output: 'boom' } }))
    expect(failed.data.error).toEqual({ code: 'X', message: '' })
    const p = f(ev('action.partial', { ...step, result: { kind: 'tool-result', toolName: 'search_portfolio', callId: 'c', output: { n: 1 } } }))
    expect((p.data.result as { output: unknown }).output).toBeNull()
    const w = f(ev('action.result', { ...step, status: 'completed', result: { kind: 'tool-result', toolName: 'schedule_call', callId: 'c', output: { status: 'rendered' } } }))
    expect((w.data.result as { output: unknown }).output).toEqual({ status: 'rendered' })
  })

  it('blanks input-request actions and settled task output unless they belong to schedule_call', () => {
    const f = createEventFilter(rules, canary)
    const q = f(ev('input.requested', { ...step, requests: [{ requestId: 'r', kind: 'tool-approval', prompt: 'ok?', action: { kind: 'tool-call', callId: 'c', toolName: 'notify_owner', input: { text: 'x' } } }] }))
    expect((q.data.requests as { action: { input: unknown } }[])[0]?.action.input).toBeNull()
    const s = f(ev('task.settled', { turnId: 't', callId: 'c', taskId: 'k', name: 'search_portfolio', status: 'completed', output: { a: 1 } }))
    expect(s.data.output).toBeNull()
    const keep = f(ev('task.settled', { turnId: 't', callId: 'c', taskId: 'k', name: 'schedule_call', status: 'completed', output: { a: 1 } }))
    expect(keep.data.output).toEqual({ a: 1 })
  })

  it('blanks schedule_call error messages too: only its successful output is visible', () => {
    const f = createEventFilter(rules, canary)
    const r = f(ev('action.result', { ...step, status: 'failed', error: { code: 'X', message: 'cal.com 500 at 10.0.0.1' }, result: { kind: 'tool-result', toolName: 'schedule_call', callId: 'c', output: { status: 'rendered' } } }))
    expect(r.data.error).toEqual({ code: 'X', message: '' })
    expect((r.data.result as { output: unknown }).output).toEqual({ status: 'rendered' })
    const ok = f(ev('action.result', { ...step, status: 'completed', result: { kind: 'tool-result', toolName: 'schedule_call', callId: 'c', output: { status: 'rendered' } } }))
    expect('error' in ok.data).toBe(false)
    const s = f(ev('task.settled', { turnId: 't', callId: 'c', taskId: 'k', name: 'schedule_call', status: 'failed', error: { message: 'token sk_live_x rejected' } }))
    expect(s.data.error).toEqual({ message: '' })
    expect('output' in s.data).toBe(false)
  })

  it('strips token usage and cost from session, turn and step events, only where the key exists', () => {
    const f = createEventFilter(rules, canary)
    const usage = { inputTokens: 10, outputTokens: 5, costUsd: 0.01 }
    for (const [type, data] of [
      ['session.waiting', { continuationToken: 'k', wait: 'next-user-message', usage }],
      ['turn.waiting', { on: 'input', sequence: 1, turnId: 't', usage }],
      ['session.completed', { usage }],
      ['session.failed', { code: 'C', message: 'm', sessionId: 's', usage }],
      ['step.completed', { ...step, finishReason: 'stop', usage }],
    ] as const) {
      const out = f(ev(type, data))
      expect(out.type).toBe(type)
      expect('usage' in out.data).toBe(true)
      expect(out.data.usage).toBeUndefined()
      expect(JSON.stringify(out)).not.toContain('costUsd')
    }
    const without = f(ev('turn.waiting', { on: 'tasks', sequence: 2, turnId: 't' }))
    expect('usage' in without.data).toBe(false)
    const compaction = f(ev('compaction.requested', { ...step, modelId: 'm', sessionId: 's', usageInputTokens: 4096 }))
    expect(compaction.data.usageInputTokens).toBeNull()
  })

  it('strips provider metadata (OpenRouter usage and cost) from any event, only where the key exists', () => {
    const f = createEventFilter(rules, canary)
    const providerMetadata = { openrouter: { usage: { cost: 0.0123, promptTokens: 10 }, provider: 'Anthropic' } }
    for (const [type, data] of [
      ['step.completed', { ...step, finishReason: 'stop', providerMetadata }],
      ['turn.waiting', { on: 'input', sequence: 1, turnId: 't', providerMetadata }],
    ] as const) {
      const out = f(ev(type, data))
      expect(out.type).toBe(type)
      expect('providerMetadata' in out.data).toBe(true)
      expect(out.data.providerMetadata).toBeUndefined()
      expect(JSON.stringify(out)).not.toMatch(/openrouter|cost/)
    }
    const without = f(ev('step.completed', { ...step, finishReason: 'stop' }))
    expect('providerMetadata' in without.data).toBe(false)
  })

  it('blanks the model id (and model) on step.started, so visitors never see which model or tier ran', () => {
    const f = createEventFilter(rules, canary)
    const out = f(ev('step.started', { ...step, modelId: 'anthropic/claude-opus-5.5', model: 'opus' }))
    expect(out.type).toBe('step.started')
    expect(out.data).toEqual({ ...step, modelId: undefined, model: undefined })
    expect(JSON.stringify(out)).not.toMatch(/claude|opus|anthropic/)
    // Keys absent from the original stay absent.
    const bare = f(ev('step.started', { ...step, stepIndex: 1, modelId: 'anthropic/claude-haiku-4.5' }))
    expect('model' in bare.data).toBe(false)
    expect('modelId' in bare.data).toBe(true)
    expect(f(ev('step.started', { ...step, stepIndex: 2 })).data).toEqual({ ...step, stepIndex: 2 })
  })

  it('still tracks a step whose model id was blanked: its deltas stream', () => {
    const f = createEventFilter(rules, canary)
    f(ev('step.started', { ...step, modelId: 'anthropic/claude-sonnet-5.5' }))
    expect(f(ev('message.appended', { ...step, messageDelta: 'word '.repeat(40) })).data.messageDelta).not.toBe('')
  })

  it('leaves events other than step.started unchanged by the model id rule', () => {
    const f = createEventFilter(rules, canary)
    const turn = ev('turn.started', { turnId: 't', sequence: 1 })
    expect(f(turn)).toEqual(turn)
  })

  it('blanks deltas of a block whose step start it did not see, and the completed event carries the redacted text', () => {
    const f = createEventFilter(rules, canary)
    const a = f(ev('message.appended', { ...step, messageDelta: `${'word '.repeat(30)}Acme ` }))
    const b = f(ev('message.appended', { ...step, messageDelta: `Secret ${'tail '.repeat(30)}`, sequence: 2 }))
    const c = f(ev('message.completed', { ...step, message: 'I worked at Acme Secret for years.', finishReason: 'stop', sequence: 3 }))
    expect([a.data.messageDelta, b.data.messageDelta]).toEqual(['', ''])
    expect(c.data.message).toBe('I worked at [redacted] for years.')
    // The next step starts inside this connection, so its deltas stream normally.
    f(ev('step.started', { ...step, stepIndex: 1, modelId: 'm' }))
    expect(f(ev('message.appended', { ...step, stepIndex: 1, messageDelta: 'word '.repeat(40) })).data.messageDelta).not.toBe('')
  })

  it.each(['turn.failed', 'step.failed', 'session.failed'])('keeps only the code of %s', (type) => {
    const f = createEventFilter(rules, canary)
    const full = f(ev(type, { ...step, code: 'model_error', message: 'relation "twin.visitors" does not exist at 10.0.0.1', details: { sql: 'select 1' } }))
    expect(full.data).toEqual({ ...step, code: 'model_error', message: '', details: undefined })
    const bare = f(ev(type, { ...step, code: 'model_error', message: 'provider said no' }))
    expect(bare.data).toEqual({ ...step, code: 'model_error', message: '' })
    expect('details' in bare.data).toBe(false)
  })

  it('blanks the prompt and options of a session-limit request, reports it, and keeps other requests', () => {
    const ended: string[] = []
    const f = createEventFilter(rules, canary, { onSessionLimit: () => ended.push('x') })
    const action = { kind: 'tool-call', callId: 'c', toolName: 'eve_session_limit', input: { used: 9 } }
    const q = f(
      ev('input.requested', {
        ...step,
        requests: [
          { requestId: 'r1', kind: 'session-limit', prompt: 'Spent $4.20 of $5, continue?', options: [{ id: 'continue', label: 'Continue' }], action },
          { requestId: 'r2', kind: 'question', prompt: 'Which slot?', options: [{ id: 'a', label: 'A' }], action },
        ],
      }),
    )
    const [limit, other] = q.data.requests as Record<string, unknown>[]
    expect(limit).toMatchObject({ requestId: 'r1', kind: 'session-limit', prompt: '', options: [] })
    expect(other).toMatchObject({ requestId: 'r2', prompt: 'Which slot?', options: [{ id: 'a', label: 'A' }] })
    expect(ended).toHaveLength(1)
    f(ev('input.requested', { ...step, requests: [{ requestId: 'r3', kind: 'question', prompt: 'p', action }] }))
    expect(ended).toHaveLength(1)
  })

  it('tolerates events without data', () => {
    const f = createEventFilter(rules, canary)
    const e = { type: 'session.completed', meta: { id: 'e', at: 't' } } as unknown as Parameters<typeof f>[0]
    expect(f(e)).toBe(e)
    expect(f({ ...e, type: 'turn.failed' })).toEqual({ ...e, type: 'turn.failed' })
  })

  it('passes other events through untouched', () => {
    const f = createEventFilter(rules, canary)
    const e = ev('turn.completed', { turnId: 't', sequence: 9 })
    expect(f(e)).toBe(e)
  })
})

describe('ndjsonLines', () => {
  it('splits across chunk boundaries and passes blank and control lines through', async () => {
    const chunks = ['{"type":"a","data":{},"meta":{"id":"1"}}\n{"ty', 'pe":"b","data":{},"meta":{"id":"2"}}\n\n{"$eve":"stream.lease-ended","version":1}\n']
    const out: string[] = []
    for await (const line of ndjsonLines(streamOf(chunks))) out.push(line)
    expect(out).toEqual(['{"type":"a","data":{},"meta":{"id":"1"}}', '{"type":"b","data":{},"meta":{"id":"2"}}', '', '{"$eve":"stream.lease-ended","version":1}'])
  })
})

describe('filterStream', () => {
  it('rewrites events line by line and keeps blank and control lines in order', async () => {
    const body = streamOf([
      `${JSON.stringify(ev('reasoning.appended', { ...step, reasoningDelta: 'hm' }))}\n\n`,
      '{"$eve":"stream.lease-ended","version":1}\n',
    ])
    const text = await new Response(filterStream(body, createEventFilter(rules, canary))).text()
    expect(text).toBe(`${JSON.stringify(ev('reasoning.appended', { ...step, reasoningDelta: '' }))}\n\n{"$eve":"stream.lease-ended","version":1}\n`)
  })

  it('passes records without a string type through, one line each', async () => {
    const odd = ['{"type":7,"meta":[]}', '{ "data": "flat" }', '{"data":{"a":1}}', '{"type":null,"data":[1]}']
    const text = await new Response(filterStream(streamOf(odd.map((l) => `${l}\n`)), createEventFilter(rules, canary))).text()
    expect(text.split('\n').map((l) => (l === '' ? l : JSON.parse(l)))).toEqual([...odd.map((l) => JSON.parse(l)), ''])
  })

  it('still blanks type-independent content on records without a string type', async () => {
    const odd = { type: 7, data: { message: 'SELECT secret', details: 'x', usage: { cost: 1 }, usageInputTokens: 9, providerMetadata: { cost: 1 }, keep: 1 } }
    const text = await new Response(filterStream(streamOf([`${JSON.stringify(odd)}\n`]), createEventFilter(rules, canary))).text()
    expect(text.split('\n')).toHaveLength(2)
    expect(JSON.parse(text)).toEqual({ type: 7, data: { message: '', usageInputTokens: null, keep: 1 } })
  })

  it('filters every record with a string type, whatever its meta or data', async () => {
    const lines = [
      { type: 'x', data: {}, meta: [] },
      { type: 'turn.completed', data: 'flat' },
      { type: 'message.completed', data: [`${canary}`] },
      { type: 'session.completed', data: null },
    ]
    const text = await new Response(filterStream(streamOf(lines.map((l) => `${JSON.stringify(l)}\n`)), createEventFilter(rules, canary))).text()
    expect(text.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l))).toEqual([
      { type: 'x', data: {}, meta: [] },
      { type: 'turn.completed', data: {} },
      { type: 'message.completed', data: {} },
      { type: 'session.completed', data: {} },
    ])
  })

  // Wrapped, as `it.each` spreads array cases into arguments.
  const malformedMeta: [unknown][] = [[null], [[]], ['x'], [5]]
  const run = async (filter: ReturnType<typeof createEventFilter>, events: unknown[]) => {
    const text = await new Response(filterStream(streamOf(events.map((e) => `${JSON.stringify(e)}\n`)), filter)).text()
    return text
      .split('\n')
      .filter((l) => l !== '')
      .map((l) => JSON.parse(l) as { type: string; data: Record<string, unknown>; meta: unknown })
  }

  it.each(malformedMeta)('redacts and canary-blocks message.appended whose meta is %j', async (meta) => {
    const out = await run(createEventFilter(rules, canary), [
      { type: 'step.started', data: { ...step, modelId: 'm' }, meta },
      { type: 'message.appended', data: { ...step, messageDelta: `${'word '.repeat(30)}Acme Secret ${'tail '.repeat(30)}` }, meta },
      { type: 'message.appended', data: { ...step, messageDelta: `then ${canary} and more`, sequence: 2 }, meta },
      { type: 'message.appended', data: { ...step, messageDelta: 'after the canary', sequence: 3 }, meta },
    ])
    expect(out).toHaveLength(4)
    expect(out[1]!.meta).toEqual(meta)
    expect(String(out[1]!.data.messageDelta).length).toBeGreaterThan(0)
    const streamed = out.map((e) => String(e.data.messageDelta ?? '')).join('')
    expect(streamed).not.toContain('Acme Secret')
    expect(streamed).not.toContain(canary)
    expect(streamed).not.toContain('after the canary')
  })

  it.each(malformedMeta)('deflects message.completed holding the canary when its meta is %j', async (meta) => {
    const [out] = await run(createEventFilter(rules, canary), [{ type: 'message.completed', data: { ...step, message: `here: ${canary}`, finishReason: 'stop' }, meta }])
    expect(out!.data.message).toBe(LEAK_DEFLECTION)
  })

  it.each(malformedMeta)('strips usage from step.completed whose meta is %j', async (meta) => {
    const [out] = await run(createEventFilter(rules, canary), [{ type: 'step.completed', data: { ...step, usage: { inputTokens: 5 }, providerMetadata: { cost: 1 } }, meta }])
    expect(out!.data).toEqual(step)
  })

  it('filters a stream event whose meta is missing rather than letting it through', async () => {
    const line = JSON.stringify({ type: 'reasoning.appended', data: { ...step, reasoningDelta: 'hm' } })
    const text = await new Response(filterStream(streamOf([`${line}\n`]), createEventFilter(rules, canary))).text()
    expect(JSON.parse(text)).toEqual({ type: 'reasoning.appended', data: { ...step, reasoningDelta: '' } })
  })

  it('passes non-object JSON lines through unchanged', async () => {
    const text = await new Response(filterStream(streamOf(['null\n42\n"s"\n[1]\n']), createEventFilter(rules, canary))).text()
    expect(text).toBe('null\n42\n"s"\n[1]\n')
  })
})
