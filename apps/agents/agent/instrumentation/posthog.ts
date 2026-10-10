import { otelIntegration } from 'eve/instrumentation/otel'
import { postHogDestination } from '../lib/observability/processor'
import { runtimeContextOf, traceIdentity } from '../lib/observability/trace-context'

/**
 * Sends eve's trace tree (turn → step → model call → tool → MCP call) to PostHog LLM analytics.
 * Each model attempt is stamped with the visitor's PostHog identity, so traces join their pageviews.
 */
export default otelIntegration({
  ...postHogDestination(),
  runtimeContext: ({ session }) => runtimeContextOf(traceIdentity(session.auth.current, session.id)),
})
