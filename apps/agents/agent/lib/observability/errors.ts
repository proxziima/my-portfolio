import type { captureServerError } from '@repo/observability/server'

type Capture = typeof captureServerError

/** What every eve failure event shares, reduced to what the report needs. */
export interface FailureFacts {
  error?: unknown
  sessionId: string
  turnId?: string
  /** Action outcome; only `failed` is a bug (rejections, cancellations and abandons are normal flow). */
  outcome?: string
}

/**
 * Reports one agent failure to Error Tracking under a single service identity: these are bugs for
 * the owner to fix, found by session id, not visitor analytics.
 */
export function reportAgentFailure(capture: Capture, kind: 'turn' | 'session' | 'model' | 'action', facts: FailureFacts): void {
  if (kind === 'action' && facts.outcome !== 'failed') return
  const error = facts.error instanceof Error ? facts.error : new Error(String(facts.error ?? `${kind} failed`))
  capture(error, { distinctId: 'twin-agent', properties: { kind, sessionId: facts.sessionId, ...(facts.turnId ? { turnId: facts.turnId } : {}) } })
}
