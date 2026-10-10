import { context, propagation, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { generationSpan, inSpan, modelIdOf, traceMeta } from '../agent/lib/observability/spans'

const exporter = new InMemorySpanExporter()
beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }))
})
afterAll(() => {
  trace.disable()
  context.disable()
  propagation.disable()
})
beforeEach(() => exporter.reset())

describe('inSpan', () => {
  it('records a span with attributes, and an error status on failure', async () => {
    await inSpan('tools/call twinSearch', { 'gen_ai.tool.name': 'twinSearch' }, async () => 1)
    await expect(
      inSpan('tools/call twinDisclose', {}, async () => {
        throw new TypeError('nope')
      }),
    ).rejects.toThrow('nope')
    const [ok, failed] = exporter.getFinishedSpans()
    expect(ok!.attributes['gen_ai.tool.name']).toBe('twinSearch')
    expect(failed!.status.code).toBe(2)
    expect(failed!.attributes['error.type']).toBe('TypeError')
  })

  it('exposes the active trace as an MCP _meta traceparent', async () => {
    let meta: Record<string, string> | undefined
    await inSpan('outer', {}, async () => {
      meta = traceMeta()
    })
    const [span] = exporter.getFinishedSpans()
    expect(meta?.traceparent).toBe(`00-${span!.spanContext().traceId}-${span!.spanContext().spanId}-01`)
  })

  it('has no traceparent outside a span', () => {
    expect(traceMeta()).toBeUndefined()
  })
})

describe('generationSpan', () => {
  it('records a gen_ai chat span with model, usage and identity', async () => {
    const result = await generationSpan('twin.gate', 'openai/gpt-4.1-mini', { distinctId: 'd-1', conversationId: 'eve-1', replaySessionId: null }, async () => ({
      usage: { inputTokens: 10, outputTokens: 2 },
      response: { modelId: 'openai/gpt-4.1-mini-2025' },
      output: 'ok',
    }))
    expect(result.output).toBe('ok')
    const [span] = exporter.getFinishedSpans()
    expect(span!.name).toBe('chat openai/gpt-4.1-mini')
    expect(span!.attributes).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'openrouter',
      'gen_ai.request.model': 'openai/gpt-4.1-mini',
      'gen_ai.response.model': 'openai/gpt-4.1-mini-2025',
      'gen_ai.usage.input_tokens': 10,
      'gen_ai.usage.output_tokens': 2,
      'gen_ai.agent.name': 'twin.gate',
      'ai.settings.context.distinctId': 'd-1',
      'ai.settings.context.sessionId': 'eve-1',
    })
  })

  it('never records the prompt or the output text', async () => {
    await generationSpan('twin.intent', 'm', undefined, async () => ({ usage: {}, output: 'secret label', text: 'secret' }))
    const [span] = exporter.getFinishedSpans()
    expect(JSON.stringify(span!.attributes)).not.toContain('secret')
    expect(span!.attributes['gen_ai.usage.input_tokens']).toBe(0)
  })
})

describe('modelIdOf', () => {
  it('reads a string or a provider model object', () => {
    expect(modelIdOf('a/b')).toBe('a/b')
    expect(modelIdOf({ modelId: 'c/d' })).toBe('c/d')
  })
})
