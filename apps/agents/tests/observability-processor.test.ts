import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { SpanExportContext } from 'eve/instrumentation/otel'
import { describe, expect, it, vi } from 'vitest'
import { lazyProcessor, redactionPolicy } from '../agent/lib/observability/processor'

const span = (attributes: Record<string, unknown>) => ({ name: 'chat x', attributes, spanContext: () => ({ traceId: 't', spanId: 's' }) }) as unknown as ReadableSpan
const inner = () => ({ onStart: vi.fn(), onEnd: vi.fn(), forceFlush: vi.fn(async () => {}), shutdown: vi.fn(async () => {}) }) satisfies SpanProcessor
const ctx: SpanExportContext = { attributes: {}, audience: 'public', name: 'chat x', spanId: 's', traceId: 't' }
const enabled = () => true

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

  it('does nothing, and never asks for the rules, when the destination is disabled', () => {
    const redactor = vi.fn(() => null)
    const p = redactionPolicy(redactor, () => false)
    expect(p.span!(ctx)).toEqual({ emit: true })
    expect(p.attribute!({ key: 'ai.prompt.messages', value: 'hi', span: ctx })).toEqual({ emit: true })
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
