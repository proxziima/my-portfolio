import { context, propagation, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { inSpan, traceMeta } from '../agent/lib/observability/spans'

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
