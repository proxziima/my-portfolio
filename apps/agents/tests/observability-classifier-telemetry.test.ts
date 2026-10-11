import { context, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { registerTelemetry, type Telemetry } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyMessage } from '../agent/lib/abuse'
import { classifyIntent } from '../agent/lib/intent/classify'

const mock = vi.hoisted(() => ({ text: '' }))
const answering = () =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: mock.text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: { inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 2, text: 2, reasoning: undefined } },
      warnings: [],
    }),
  })
vi.mock('../agent/lib/models', () => ({ classifierModel: () => answering(), intentClassifierModel: () => answering() }))

const exporter = new InMemorySpanExporter()
let integration: Telemetry
beforeAll(async () => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }))
  // The integration eve registers once OTel is declared (eve's ai-sdk-telemetry: `new OpenTelemetry({ runtimeContext: true })`).
  const url = new URL('../../compiled/@ai-sdk/otel/index.js', import.meta.resolve('eve/instrumentation/otel'))
  const { OpenTelemetry } = (await import(url.href)) as { OpenTelemetry: new (o: { runtimeContext: boolean }) => Telemetry }
  integration = new OpenTelemetry({ runtimeContext: true })
  registerTelemetry(integration)
})
afterAll(() => {
  const g = globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }
  g.AI_SDK_TELEMETRY_INTEGRATIONS = g.AI_SDK_TELEMETRY_INTEGRATIONS?.filter((i) => i !== integration)
  trace.disable()
  context.disable()
})
beforeEach(() => exporter.reset())

const identity = { distinctId: 'ph-1', conversationId: 'eve-1', replaySessionId: 'replay-1' }
const spans = () => exporter.getFinishedSpans()
const chats = () => spans().filter((s) => s.attributes['gen_ai.operation.name'] === 'chat')
const root = () => spans().find((s) => s.attributes['gen_ai.operation.name'] === 'invoke_agent')

describe('classifier generations under eve’s AI SDK telemetry', () => {
  it('the gate emits exactly one chat generation, its operation named and tied to the visitor', async () => {
    mock.text = JSON.stringify({ verdict: 'ok', depth: 'light' })
    expect(await classifyMessage('oi', [], 1_000, identity)).toEqual({ verdict: 'ok', depth: 'light' })
    expect(chats()).toHaveLength(1)
    expect(chats()[0]!.attributes['gen_ai.usage.input_tokens']).toBe(5)
    expect(root()!.attributes).toMatchObject({
      'gen_ai.agent.name': 'twin.gate',
      'ai.settings.context.distinctId': 'ph-1',
      'ai.settings.context.sessionId': 'eve-1',
      'ai.settings.context.$session_id': 'replay-1',
    })
    // One trace: the chat span sits under the operation that carries the identity.
    expect(new Set(spans().map((s) => s.spanContext().traceId)).size).toBe(1)
  })

  it('the intent label emits exactly one chat generation tied to the visitor', async () => {
    mock.text = JSON.stringify({ result: 'evaluating' })
    expect(await classifyIntent([{ role: 'visitor', text: 'Tell me more' }], 1_000, identity)).toBe('evaluating')
    expect(chats()).toHaveLength(1)
    expect(root()!.attributes).toMatchObject({ 'gen_ai.agent.name': 'twin.intent', 'ai.settings.context.distinctId': 'ph-1' })
  })

  it('carries no identity without a trace, and still answers', async () => {
    mock.text = JSON.stringify({ verdict: 'spam', depth: 'light' })
    expect(await classifyMessage('buy now', [], 1_000)).toEqual({ verdict: 'spam', depth: 'light' })
    expect(chats()).toHaveLength(1)
    expect(Object.keys(root()!.attributes).some((k) => k.startsWith('ai.settings.context.'))).toBe(false)
  })
})
