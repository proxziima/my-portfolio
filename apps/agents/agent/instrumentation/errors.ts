import { captureServerError, serverPostHog } from '@repo/observability/server'
import { defineInstrumentation } from 'eve/instrumentation'
import { reportAgentFailure } from '../lib/observability/errors'

/**
 * Turn, session, model and tool failures go to PostHog Error Tracking. Outputs are recorded only
 * because error details are an output; nothing here reads prompts or replies.
 */
export default defineInstrumentation({
  tracePolicy: () => ({ emit: true, recordInputs: false, recordOutputs: true }),
  events: {
    'turn.failed': (e) => reportAgentFailure(captureServerError, 'turn', { error: e.error, sessionId: e.sessionId, turnId: e.turnId }),
    'session.failed': (e) => reportAgentFailure(captureServerError, 'session', { error: e.error, sessionId: e.sessionId, turnId: e.turnId }),
    'model.call.failed': (e) => reportAgentFailure(captureServerError, 'model', { error: e.error, sessionId: e.scope.sessionId, turnId: e.scope.turnId }),
    'tool.call.failed': (e) => reportAgentFailure(captureServerError, 'tool', { error: e.error, sessionId: e.scope.sessionId, turnId: e.scope.turnId, outcome: e.outcome }),
  },
  flush: () => serverPostHog().flush(),
})
