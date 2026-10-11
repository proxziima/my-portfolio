import { describe, expect, it } from 'vitest'
import { classifierTelemetry, runtimeContextOf, traceIdentity } from '../agent/lib/observability/trace-context'

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

describe('runtime context', () => {
  it('names the keys PostHog maps (distinctId → person, sessionId → $ai_session_id, $session_id → replay)', () => {
    const id = traceIdentity(principal({ ph_did: 'd-1', ph_sid: 's-1' }), 'eve-1')
    expect(runtimeContextOf(id)).toEqual({ distinctId: 'd-1', sessionId: 'eve-1', $session_id: 's-1' })
  })
  it('omits the replay key without a browser session', () => {
    expect(runtimeContextOf(traceIdentity(null, 'eve-1'))).toEqual({ distinctId: 'twin-session:eve-1', sessionId: 'eve-1' })
  })
})

describe('classifierTelemetry', () => {
  it('names the generation and opts every runtime context key in', () => {
    const id = traceIdentity(principal({ ph_did: 'd-1', ph_sid: 's-1' }), 'eve-1')
    expect(classifierTelemetry('twin.gate', id)).toEqual({
      telemetry: { functionId: 'twin.gate', includeRuntimeContext: { distinctId: true, sessionId: true, $session_id: true } },
      runtimeContext: { distinctId: 'd-1', sessionId: 'eve-1', $session_id: 's-1' },
    })
  })
  it('only names the generation without an identity', () => {
    expect(classifierTelemetry('twin.intent', undefined)).toEqual({ telemetry: { functionId: 'twin.intent' } })
  })
})
