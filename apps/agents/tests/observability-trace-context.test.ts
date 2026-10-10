import { describe, expect, it } from 'vitest'
import { contextAttributes, runtimeContextOf, traceIdentity } from '../agent/lib/observability/trace-context'

const principal = (attributes: Record<string, string>) => ({ principalType: 'user', principalId: 'web:11111111-1111-4111-8111-111111111111', authenticator: 'twin-web', attributes })

describe('traceIdentity', () => {
  it('uses the browser PostHog ids when the JWT carried them', () => {
    expect(traceIdentity(principal({ ph_did: 'd-1', ph_sid: 's-1' }), 'eve-1')).toEqual({ distinctId: 'd-1', conversationId: 'eve-1', replaySessionId: 's-1' })
  })
  it('falls back to the principal, then to the session, so traces are never randomly anonymous', () => {
    expect(traceIdentity(principal({}), 'eve-1')).toEqual({ distinctId: 'web:11111111-1111-4111-8111-111111111111', conversationId: 'eve-1', replaySessionId: null })
    expect(traceIdentity(null, 'eve-1')).toEqual({ distinctId: 'twin-session:eve-1', conversationId: 'eve-1', replaySessionId: null })
  })
})

describe('runtime context and span attributes', () => {
  it('names the keys PostHog maps (distinctId → person, sessionId → $ai_session_id, $session_id → replay)', () => {
    const id = traceIdentity(principal({ ph_did: 'd-1', ph_sid: 's-1' }), 'eve-1')
    expect(runtimeContextOf(id)).toEqual({ distinctId: 'd-1', sessionId: 'eve-1', $session_id: 's-1' })
    expect(contextAttributes(id)).toEqual({ 'ai.settings.context.distinctId': 'd-1', 'ai.settings.context.sessionId': 'eve-1', 'ai.settings.context.$session_id': 's-1' })
  })
  it('omits the replay key without a browser session', () => {
    expect(runtimeContextOf(traceIdentity(null, 'eve-1'))).toEqual({ distinctId: 'twin-session:eve-1', sessionId: 'eve-1' })
  })
})
