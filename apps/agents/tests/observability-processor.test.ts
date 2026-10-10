import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { SpanExportContext, SpanExportPolicy } from 'eve/instrumentation/otel'
import { describe, expect, it, vi } from 'vitest'
import { IDENTITY_KEYS, lazyProcessor, makeRedactor, postHogDestination, redactingEventsProcessor, redactionPolicy } from '../agent/lib/observability/processor'

const UUID = '11111111-1111-4111-8111-111111111111' // twelve joined digits: the PII phone rule matches it
const CANARY = 'CANARY-0123456789abcdef'
const rules = { terms: ['Rosebud'], allow: [] }

type FakeEvent = { name: string; time: [number, number]; attributes?: Record<string, unknown> }
const span = (attributes: Record<string, unknown>, extra: { events?: FakeEvent[]; status?: { code: number; message?: string } } = {}) =>
  ({ name: 'chat x', attributes, events: extra.events ?? [], status: extra.status ?? { code: 0 }, spanContext: () => ({ traceId: 't', spanId: 's' }) }) as unknown as ReadableSpan
const inner = () => ({ onStart: vi.fn(), onEnd: vi.fn(), forceFlush: vi.fn(async () => {}), shutdown: vi.fn(async () => {}) }) satisfies SpanProcessor
const ctx: SpanExportContext = { attributes: {}, audience: 'public', name: 'chat x', spanId: 's', traceId: 't' }
const enabled = () => true
const sent = (p: ReturnType<typeof inner>) => p.onEnd.mock.calls[0]![0] as ReadableSpan

/** eve's content keys the span-level `{ redact }` decision strips (a subset, for the simulation). */
const EVE_CONTENT = new Set(['gen_ai.input.messages', 'gen_ai.output.messages', 'gen_ai.system_instructions'])

/** What eve's content-span-processor does with a destination's policy, reduced to plain objects. */
function applyPolicy(policy: SpanExportPolicy, s: ReadableSpan): ReadableSpan {
  const decision = policy.span!({ ...ctx, attributes: s.attributes })
  if ('emit' in decision && !decision.emit) throw new Error('dropped')
  const attributes: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(s.attributes)) {
    if ('redact' in decision && EVE_CONTENT.has(key)) continue
    const d = policy.attribute!({ key, value, span: ctx })
    if ('replace' in d) attributes[key] = d.value
    else if (d.emit) attributes[key] = value
  }
  return Object.create(s, { attributes: { value: attributes, enumerable: true } }) as ReadableSpan
}

describe('makeRedactor', () => {
  it('redacts the CMS terms and PII', () => {
    expect(makeRedactor(rules, CANARY)('Rosebud, call +1 415 555 0100')).toBe('[redacted], call [redacted]')
  })
  it('scrubs the canary before redaction can split it', () => {
    // The phone rule overlaps the canary's digits; scrubbing first keeps the canary from surviving in pieces.
    const r = makeRedactor(rules, CANARY)
    expect(r(`leak ${CANARY}9 end`)).not.toContain('CANARY')
    expect(r(`leak ${CANARY} end`)).toBe('leak [canary] end')
  })
})

describe('redactionPolicy', () => {
  it('redacts every string attribute and leaves other values alone', () => {
    const p = redactionPolicy(() => (s) => s.replace('secret', '[redacted]'), enabled)
    expect(p.span!(ctx)).toEqual({ emit: true })
    expect(p.attribute!({ key: 'gen_ai.input.messages', value: 'a secret', span: ctx })).toEqual({ replace: true, value: 'a [redacted]' })
    expect(p.attribute!({ key: 'gen_ai.usage.input_tokens', value: 3, span: ctx })).toEqual({ emit: true })
  })

  it('redacts string arrays element by element', () => {
    const p = redactionPolicy(() => (s) => s.toUpperCase(), enabled)
    expect(p.attribute!({ key: 'ai.response.text', value: ['a', 'b'], span: ctx })).toEqual({ replace: true, value: ['A', 'B'] })
  })

  it('holds back content while the rules are not loaded: eve redacts its content attributes, the rest of content-like strings drop', () => {
    const p = redactionPolicy(() => null, enabled)
    expect(p.span!(ctx)).toEqual({ redact: true, inputs: true, outputs: true })
    expect(p.attribute!({ key: 'ai.prompt.messages', value: 'hi', span: ctx })).toEqual({ emit: false })
    expect(p.attribute!({ key: 'mcp.tool.result', value: 'x', span: ctx })).toEqual({ emit: false })
    expect(p.attribute!({ key: 'gen_ai.request.model', value: 'm', span: ctx })).toEqual({ emit: true })
    expect(p.attribute!({ key: 'gen_ai.usage.output_tokens', value: 1, span: ctx })).toEqual({ emit: true })
  })

  it('never redacts or drops the identity and correlation ids, which the phone rule would mangle', () => {
    expect(makeRedactor(rules, CANARY)(UUID)).not.toBe(UUID)
    for (const redactor of [() => makeRedactor(rules, CANARY), () => null]) {
      const p = redactionPolicy(redactor, enabled)
      for (const key of IDENTITY_KEYS) expect(p.attribute!({ key, value: UUID, span: ctx })).toEqual({ emit: true })
    }
    expect(IDENTITY_KEYS).toContain('ai.settings.context.sessionId')
    expect(IDENTITY_KEYS).toContain('gen_ai.conversation.id')
  })

  it('does nothing, and never asks for the rules, when the destination is disabled', () => {
    const redactor = vi.fn(() => null)
    const p = redactionPolicy(redactor, () => false)
    expect(p.span!(ctx)).toEqual({ emit: true })
    expect(p.attribute!({ key: 'ai.prompt.messages', value: 'hi', span: ctx })).toEqual({ emit: true })
    expect(redactor).not.toHaveBeenCalled()
  })
})

describe('redactingEventsProcessor', () => {
  const failed = () =>
    span(
      { 'gen_ai.request.model': 'm' },
      { events: [{ name: 'exception', time: [1, 0], attributes: { 'exception.message': 'Rosebud failed', 'exception.stacktrace': 'at Rosebud', 'exception.escaped': false } }], status: { code: 2, message: 'Rosebud failed' } },
    )

  it('redacts event attributes and the status message, leaving the original span alone', () => {
    const next = inner()
    const original = failed()
    redactingEventsProcessor(next, () => makeRedactor(rules, CANARY)).onEnd(original)
    expect(sent(next).events[0]!.attributes).toEqual({ 'exception.message': '[redacted] failed', 'exception.stacktrace': 'at [redacted]', 'exception.escaped': false })
    expect(sent(next).status).toEqual({ code: 2, message: '[redacted] failed' })
    expect(sent(next).spanContext().traceId).toBe('t')
    expect(sent(next).name).toBe('chat x')
    expect(original.status.message).toBe('Rosebud failed')
  })

  it('drops event strings and the status message while the rules are not loaded', () => {
    const next = inner()
    redactingEventsProcessor(next, () => null).onEnd(failed())
    expect(sent(next).events[0]!.attributes).toEqual({ 'exception.escaped': false })
    expect(sent(next).status).toEqual({ code: 2 })
  })
})

describe('postHogDestination (policy and processors together)', () => {
  const turn = () =>
    span(
      { 'gen_ai.input.messages': 'my name is Rosebud', 'mcp.tool.result': 'Rosebud', 'gen_ai.usage.input_tokens': 7, 'ai.settings.context.sessionId': UUID },
      { events: [{ name: 'exception', time: [1, 0], attributes: { 'exception.message': 'Rosebud' } }], status: { code: 2, message: 'Rosebud' } },
    )
  const destination = (redactor: () => ((t: string) => string) | null) => {
    const exporter = inner()
    const d = postHogDestination({ config: () => ({ token: 'phc_x', ingestHost: 'https://us.i.posthog.com' }), redactor, exporter: () => exporter })
    return { d, exporter }
  }

  it('hands the exporter redacted attributes, events and status, with the ids intact', () => {
    const { d, exporter } = destination(() => makeRedactor(rules, CANARY))
    for (const p of d.spanProcessors) p.onEnd(applyPolicy(d.exportPolicy, turn()))
    const out = sent(exporter)
    expect(out.attributes).toEqual({ 'gen_ai.input.messages': 'my name is [redacted]', 'mcp.tool.result': '[redacted]', 'gen_ai.usage.input_tokens': 7, 'ai.settings.context.sessionId': UUID })
    expect(out.events[0]!.attributes).toEqual({ 'exception.message': '[redacted]' })
    expect(out.status).toEqual({ code: 2, message: '[redacted]' })
  })

  it('strips content before the rules load', () => {
    const { d, exporter } = destination(() => null)
    for (const p of d.spanProcessors) p.onEnd(applyPolicy(d.exportPolicy, turn()))
    const out = sent(exporter)
    expect(out.attributes).toEqual({ 'gen_ai.usage.input_tokens': 7, 'ai.settings.context.sessionId': UUID })
    expect(out.events[0]!.attributes).toEqual({})
    expect(out.status).toEqual({ code: 2 })
  })

  it('is inert without a token', () => {
    const exporter = inner()
    const redactor = vi.fn(() => null)
    const d = postHogDestination({ config: () => null, redactor, exporter: () => exporter })
    for (const p of d.spanProcessors) p.onEnd(applyPolicy(d.exportPolicy, turn()))
    expect(exporter.onEnd).not.toHaveBeenCalled()
    expect(redactor).not.toHaveBeenCalled()
  })
})

describe('lazyProcessor', () => {
  it('builds the inner processor on first use, once, and forwards every call', async () => {
    const next = inner()
    const create = vi.fn(() => next)
    const p = lazyProcessor(create)
    expect(create).not.toHaveBeenCalled()
    p.onEnd(span({}))
    p.onEnd(span({}))
    await p.forceFlush()
    await p.shutdown()
    expect(create).toHaveBeenCalledTimes(1)
    expect(next.onEnd).toHaveBeenCalledTimes(2)
    expect(next.forceFlush).toHaveBeenCalled()
    expect(next.shutdown).toHaveBeenCalled()
  })
  it('is a no-op when unconfigured', async () => {
    const p = lazyProcessor(() => null)
    expect(() => p.onEnd(span({}))).not.toThrow()
    await expect(p.forceFlush()).resolves.toBeUndefined()
  })
})
