import { TWIN_LIMITS, type ModelTier } from '@repo/twin/contract'
import { updateConversation } from '@repo/twin/db'
import type { UserContent } from 'ai'
import { localDev } from 'eve/channels/auth'
import { defaultEveAuth, eveChannel } from 'eve/channels/eve'
import { classifyMessage, closingContext, countsAsViolation, deflectionContext, offScopeContext } from '../lib/abuse'
import { ensureConversation } from '../lib/conversation'
import { db } from '../lib/db'
import { getEnv } from '../lib/env'
import { recentTurns } from '../lib/transcript'
import { visitorAuth } from '../lib/visitor-auth'

/** The text of a user message, whether eve passes a string or content parts. */
function textOf(message: string | UserContent): string {
  if (typeof message === 'string') return message
  return message.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
}

/** The last exchange, for the gate's depth judgement; empty when it can't be read, because `onMessage` must never throw. */
async function previousExchange(sessionId: string) {
  try {
    return await recentTurns(sessionId, 2)
  } catch (error) {
    console.error('[twin] previous exchange unavailable for the gate', error instanceof Error ? error.message : error)
    return []
  }
}

/**
 * The state with this message's tier, unless a message that began classifying later already wrote its own:
 * with `steer`, classifications of messages sent close together can finish out of order, and the newer
 * message must win. Runs inside the row-locked updater, so the comparison and the write are atomic.
 */
function withTier<S extends { modelTier: ModelTier; modelTierAt: string | null }>(
  s: S,
  modelTier: ModelTier,
  startedAt: string,
): S {
  if (s.modelTierAt !== null && startedAt < s.modelTierAt) return s
  return { ...s, modelTier, modelTierAt: startedAt }
}

/** Records the tier the turn about to start runs on; the agent's model resolver reads it. */
async function storeTier(sessionId: string, modelTier: ModelTier, startedAt: string) {
  await updateConversation(db(), sessionId, (s) => withTier(s, modelTier, startedAt))
}

/**
 * The visitor channel. Only the BFF can reach it (internal network) and every request carries a
 * BFF-minted JWT. `steer` keeps the conversation open while an approval task waits (spec §6).
 */
export default eveChannel({
  auth: [visitorAuth, localDev()],
  turnPolicy: 'steer',
  uploadPolicy: 'disabled',
  async onMessage(ctx, message) {
    // Taken before any await: it orders this message against steered ones still classifying.
    const startedAt = new Date().toISOString()
    const auth = defaultEveAuth(ctx)
    const sessionId = ctx.eve.sessionId
    // The web BFF always creates the session without a message and then sends to /session/:id,
    // so only `eve dev` or direct callers reach this point without a session id and skip the gate.
    if (!sessionId) return { auth }
    // The BFF creates the row for web visitors; `eve dev` sessions may not have one yet.
    const current = await ensureConversation(sessionId, auth)
    if (current.ended) {
      // The closing turn is a goodbye; it needs no big model.
      await storeTier(sessionId, 'light', startedAt)
      return { auth, context: [closingContext()] }
    }
    const gateStart = Date.now()
    const { verdict, depth } = await classifyMessage(
      textOf(message),
      await previousExchange(sessionId),
      getEnv().TWIN_ABUSE_TIMEOUT_MS,
    )
    // Deflections are one short line in character, so anything that isn't ok runs on the light tier.
    const modelTier: ModelTier = verdict === 'ok' ? depth : 'light'
    // One line per turn for tuning routing and the gate; labels only, never the visitor's text.
    console.info('[twin] gate', { sessionId, verdict, depth, modelTier, ms: Date.now() - gateStart })
    if (verdict === 'ok') {
      await storeTier(sessionId, modelTier, startedAt)
      return { auth }
    }
    if (!countsAsViolation(verdict)) {
      await storeTier(sessionId, modelTier, startedAt)
      return { auth, context: [offScopeContext()] }
    }
    const state = await updateConversation(db(), sessionId, (s) => {
      const violations = s.violations + 1
      return withTier({ ...s, violations, ended: s.ended || violations >= TWIN_LIMITS.maxViolations }, modelTier, startedAt)
    })
    return { auth, context: [deflectionContext(verdict, state.ended)] }
  },
})
