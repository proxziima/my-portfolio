import { context, propagation, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const m = vi.hoisted(() => ({ result: null as unknown, params: [] as unknown[], close: vi.fn(async () => {}) }))
vi.mock('../agent/lib/env', () => ({ getEnv: () => ({ PAYLOAD_MCP_URL: 'https://cms.test/api/mcp', PAYLOAD_MCP_API_KEY: 'k' }) }))
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    sessionId = 'mcp-session-1'
  },
}))
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    async connect() {}
    async callTool(params: unknown) {
      m.params.push(params)
      return m.result
    }
    close = m.close
  },
}))

const { callPayloadTool } = await import('../agent/lib/payload-mcp')
const Schema = z.object({ ok: z.boolean() })

beforeEach(() => {
  m.close.mockClear()
  m.params = []
})

describe('callPayloadTool', () => {
  it('validates the JSON text content against the schema', async () => {
    m.result = { content: [{ type: 'image', data: 'x' }, { type: 'text', text: '{"ok":true}' }] }
    await expect(callPayloadTool('twinSearch', {}, Schema)).resolves.toEqual({ ok: true })
    expect(m.close).toHaveBeenCalledTimes(1)
  })

  it('rejects content that is not a list of content blocks, and still closes', async () => {
    m.result = { content: 'not a list' }
    await expect(callPayloadTool('twinSearch', {}, Schema)).rejects.toThrow(/twinSearch returned malformed content/)
    expect(m.close).toHaveBeenCalledTimes(1)
  })

  it('rejects a result with no text block', async () => {
    m.result = { content: [{ type: 'image', data: 'x' }] }
    await expect(callPayloadTool('twinIdentity', {}, Schema)).rejects.toThrow(/returned no text content/)
  })

  it('sends no _meta when no tracer is registered', async () => {
    m.result = { content: [{ type: 'text', text: '{"ok":true}' }] }
    await callPayloadTool('twinSearch', { query: 'q' }, Schema)
    expect(m.params[0]).toEqual({ name: 'twinSearch', arguments: { query: 'q' } })
  })
})

describe('callPayloadTool tracing', () => {
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

  it('is one tools/call span whose traceparent rides in _meta, with no arguments or result on it', async () => {
    m.result = { content: [{ type: 'text', text: '{"ok":true}' }] }
    await callPayloadTool('twinSearch', { query: 'Rosebud' }, Schema)
    const [span] = exporter.getFinishedSpans()
    expect(span!.name).toBe('tools/call twinSearch')
    expect(span!.attributes).toEqual({
      'mcp.method.name': 'tools/call',
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'twinSearch',
      'mcp.session.id': 'mcp-session-1',
    })
    const { traceId, spanId } = span!.spanContext()
    expect(m.params[0]).toEqual({ name: 'twinSearch', arguments: { query: 'Rosebud' }, _meta: { traceparent: `00-${traceId}-${spanId}-01` } })
  })

  it('marks the span failed when the tool errors', async () => {
    m.result = { isError: true, content: [{ type: 'text', text: 'boom' }] }
    await expect(callPayloadTool('twinDisclose', {}, Schema)).rejects.toThrow(/twinDisclose failed/)
    const [span] = exporter.getFinishedSpans()
    expect(span!.status.code).toBe(2)
    expect(span!.attributes['error.type']).toBe('Error')
  })
})
