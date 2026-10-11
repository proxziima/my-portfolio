import type { captureServerError } from '@repo/observability/server'

type Capture = typeof captureServerError

/** What every eve failure event shares, reduced to what the report needs. */
export interface FailureFacts {
  error?: unknown
  sessionId: string
  turnId?: string
  /**
   * Tool-call outcome; only `failed` is a bug (rejections, cancellations and abandons are normal flow).
   * eve may omit it on `tool.call.failed`, which then means `failed`, as eve's own tracing reads it.
   */
  outcome?: string
}

/**
 * Reports one agent failure to Error Tracking under a single service identity: these are bugs for
 * the owner to fix, found by session id, not visitor analytics.
 */
export function reportAgentFailure(capture: Capture, kind: 'turn' | 'session' | 'model' | 'tool', facts: FailureFacts): void {
  if (kind === 'tool' && (facts.outcome ?? 'failed') !== 'failed') return
  const error = facts.error instanceof Error ? facts.error : new Error(String(facts.error ?? `${kind} failed`))
  capture(error, { distinctId: 'twin-agent', properties: { kind, sessionId: facts.sessionId, ...(facts.turnId ? { turnId: facts.turnId } : {}) } })
}
