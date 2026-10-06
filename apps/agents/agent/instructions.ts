import { setEvaluationOutcome, updateConversation } from '@repo/twin/db'
import { defineDynamic, defineInstructions } from 'eve/instructions'
import { ensureConversation } from './lib/conversation'
import { db } from './lib/db'
import { getEnv } from './lib/env'
import { cachedGrounding } from './lib/grounding'
import type { Principal } from './lib/identity'
import { buildTurnPrompt, fallbackPrompt } from './lib/prompt'

/** The canary, or null when the env can't be read (the fallback then omits the canary line). */
function readableCanary(): string | null {
  try {
    return getEnv().TWIN_PROMPT_CANARY
  } catch {
    return null
  }
}

/**
 * The whole system prompt, composed per turn (spec §5): canary, grounding, active skills, then the
 * state digest. Everything is system role, so nothing lands in history. It fails closed: eve skips a
 * throwing resolver, which would leave the model with no instructions at all, so any failure
 * returns the identity-and-boundaries fallback instead.
 */
export default defineDynamic({
  events: {
    'turn.started': async (_event, ctx) => {
      try {
        const env = getEnv()
        let state = await ensureConversation(ctx.session.id, ctx.session.auth.current as Principal | null)
        // Fetched before any write, so a fallback turn never records an offer it didn't make.
        const grounding = await cachedGrounding()
        // A warm offer is made at most once and keyed to its turn: a replayed step of that turn
        // sees callOfferTurn === turnCount and re-issues the same directive without writing again.
        if (state.intent.tier === 'warm' && state.callOfferTurn === null && !state.callOfferDeclined && !state.widgetShown) {
          state = await updateConversation(db(), ctx.session.id, (s) => (s.callOfferTurn === null ? { ...s, callOfferTurn: s.turnCount } : s))
          // The outcome is a tuning label only: once the offer is recorded, losing the label must
          // never turn this into a fallback turn, so its failure is logged and the turn goes on.
          if (state.intent.lastEvaluationId) {
            try {
              await setEvaluationOutcome(db(), state.intent.lastEvaluationId, 'offered')
            } catch (err) {
              console.error('[twin] evaluation outcome write failed', err)
            }
          }
        }
        return defineInstructions({ content: buildTurnPrompt({ canary: env.TWIN_PROMPT_CANARY, grounding, state }), role: 'system' })
      } catch (err) {
        console.error(`[instructions] turn prompt failed for session ${ctx.session.id}; using the fallback`, err)
        return defineInstructions({ content: fallbackPrompt(readableCanary()), role: 'system' })
      }
    },
  },
})
