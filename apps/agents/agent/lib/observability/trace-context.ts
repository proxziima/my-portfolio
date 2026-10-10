import type { Principal } from '../identity'

/** Who a twin trace belongs to in PostHog. */
export interface TraceIdentity {
  /** The browser's PostHog distinct id when known, so traces join the visitor's person timeline. */
  distinctId: string
  /** The eve session: one conversation, PostHog's `$ai_session_id`. */
  conversationId: string
  /** The browser's PostHog session, which links the trace to the replay. */
  replaySessionId: string | null
}

const attr = (p: Pick<Principal, 'attributes'> | null | undefined, key: string): string | null => {
  const value = p?.attributes[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** The trace identity for a session, from the principal's JWT-carried PostHog ids. */
export function traceIdentity(principal: Pick<Principal, 'principalId' | 'attributes'> | null | undefined, sessionId: string): TraceIdentity {
  return {
    distinctId: attr(principal, 'ph_did') ?? principal?.principalId ?? `twin-session:${sessionId}`,
    conversationId: sessionId,
    replaySessionId: attr(principal, 'ph_sid'),
  }
}

/**
 * eve's runtime context for model spans. The key names follow PostHog's AI SDK v7 OTel mapping
 * (posthog.com/docs/llm-analytics/installation/vercel-ai): `distinctId`, `sessionId`; other
 * scalars become event properties, so `$session_id` links session replay.
 */
export function runtimeContextOf(id: TraceIdentity): Record<string, string> {
  return { distinctId: id.distinctId, sessionId: id.conversationId, ...(id.replaySessionId ? { $session_id: id.replaySessionId } : {}) }
}

/** The same context as span attributes, for spans the twin starts itself (eve flattens to `ai.settings.context.*`). */
export function contextAttributes(id: TraceIdentity): Record<string, string> {
  return Object.fromEntries(Object.entries(runtimeContextOf(id)).map(([k, v]) => [`ai.settings.context.${k}`, v]))
}
