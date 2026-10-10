import { context, propagation, SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api'
import { contextAttributes, type TraceIdentity } from './trace-context'

/** eve registers the global tracer provider; outside it (unit tests, scripts) these spans are no-ops. */
const tracer = () => trace.getTracer('portfolio-twin')

/**
 * Runs `fn` inside an active span; a throw marks the span failed and is rethrown unchanged.
 * Callers set ids and labels only: prompts, arguments and results never become attributes.
 */
export function inSpan<T>(name: string, attributes: Attributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span)
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error))
      span.setStatus({ code: SpanStatusCode.ERROR })
      span.setAttribute('error.type', error instanceof Error ? error.name : 'Error')
      throw error
    } finally {
      span.end()
    }
  })
}

/** The active trace as MCP `_meta` (W3C traceparent), so the server's span joins the caller's trace. */
export function traceMeta(): Record<string, string> | undefined {
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  return carrier.traceparent ? { traceparent: carrier.traceparent } : undefined
}

/** A model's id whether the AI SDK was handed a string or a provider model object. */
export function modelIdOf(model: string | { modelId: string }): string {
  return typeof model === 'string' ? model : model.modelId
}

/**
 * Wraps a direct AI SDK call (the gate and intent classifiers run outside eve's model loop) in a
 * gen_ai chat span, which PostHog turns into an `$ai_generation` in the visitor's conversation.
 */
export function generationSpan<R extends { usage?: { inputTokens?: number; outputTokens?: number }; response?: { modelId?: string } }>(
  functionId: string,
  modelId: string,
  identity: TraceIdentity | undefined,
  run: () => Promise<R>,
): Promise<R> {
  const attributes: Attributes = {
    'gen_ai.operation.name': 'chat',
    'gen_ai.provider.name': 'openrouter',
    'gen_ai.request.model': modelId,
    'gen_ai.agent.name': functionId,
    ...(identity ? contextAttributes(identity) : {}),
  }
  return inSpan(`chat ${modelId}`, attributes, async (span) => {
    const result = await run()
    // Optional reads: test doubles of generateText often omit usage and response.
    span.setAttributes({
      'gen_ai.response.model': result.response?.modelId ?? modelId,
      'gen_ai.usage.input_tokens': result.usage?.inputTokens ?? 0,
      'gen_ai.usage.output_tokens': result.usage?.outputTokens ?? 0,
    })
    return result
  })
}
