import { otel } from 'eve/instrumentation/otel'

/**
 * Process-wide OTel capture ceiling: record prompts and replies so PostHog shows full chat traces.
 * The PostHog destination redacts them with the transcript's rules (lib/observability/processor.ts).
 * Lifecycle providers (spend.ts) keep their own policies.
 */
export default otel({
  functionId: 'portfolio-twin',
  tracePolicy: () => ({ emit: true, recordInputs: true, recordOutputs: true }),
})
