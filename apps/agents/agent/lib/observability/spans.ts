import { context, propagation, SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api'

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
