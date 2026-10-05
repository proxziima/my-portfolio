import { getConversation, insertEvaluation, updateConversation } from '@repo/twin/db'
import { db } from '../db'
import { getEnv } from '../env'
import { recentTurns } from '../transcript'
import { classifyIntent } from './classify'
import { scoreIntent } from './score'
import { signalsOf } from './signals'

/**
 * evaluate_call_intent: runs after each final reply, never before it streams, so it adds nothing
 * to time-to-first-token (spec §7). Idempotent per (session, turn, sequence).
 */
export async function evaluateCallIntent(sessionId: string, turnId: string, sequence: number): Promise<void> {
  const conversation = await getConversation(db(), sessionId)
  if (!conversation || conversation.state.ended) return
  const started = Date.now()
  const classification = await classifyIntent(await recentTurns(sessionId, 6), getEnv().TWIN_CLASSIFIER_TIMEOUT_MS)
  const latencyMs = Date.now() - started
  const signals = signalsOf(conversation.state)
  const result = scoreIntent(signals, classification, conversation.state)
  const id = await insertEvaluation(db(), {
    sessionId,
    turnId,
    sequence,
    score: result.score,
    tier: result.tier,
    classification,
    reasons: result.reasons,
    signals: { ...signals },
    latencyMs,
    // Timeouts and other classifier failures share this outcome (no migration for a new value);
    // the reason text says the classifier was unavailable and failures are logged.
    outcome: classification === null ? 'classifier_timeout' : 'none',
  })
  if (id === null) return // already evaluated (redelivered hook)
  await updateConversation(db(), sessionId, (s) => ({ ...s, intent: { score: result.score, tier: result.tier, lastEvaluationId: id } }))
}
