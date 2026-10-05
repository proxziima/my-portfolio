import { setEvaluationOutcome, updateConversation } from '@repo/twin/db'
import { TwinIdentity } from '@repo/twin/contract'
import { defineDynamic, defineInstructions } from 'eve/instructions'
import { ensureConversation, groundingBlock } from './lib/conversation'
import { db } from './lib/db'
import { getEnv } from './lib/env'
import type { Principal } from './lib/identity'
import { callPayloadTool } from './lib/payload-mcp'
import { activeSkills, composeSkills } from './lib/skills/compose'
import { stateDigest } from './lib/state-digest'

/**
 * The whole system prompt, composed per turn (spec §5): canary, active skills, then the state
 * digest. Grounding is session-scoped. Everything is system role, so nothing lands in history.
 */
export default defineDynamic({
  events: {
    'session.started': async () => {
      const env = getEnv()
      const identity = await callPayloadTool('twinIdentity', {}, TwinIdentity)
      return defineInstructions({ content: groundingBlock(identity, env.TWIN_PROMPT_CANARY), role: 'system' })
    },
    'turn.started': async (_event, ctx) => {
      const env = getEnv()
      let state = await ensureConversation(ctx.session.id, ctx.session.auth.current as Principal | null)
      // A warm offer is made at most once and keyed to its turn: a replayed step of that turn
      // sees callOfferTurn === turnCount and re-issues the same directive without writing again.
      if (state.intent.tier === 'warm' && state.callOfferTurn === null && !state.callOfferDeclined && !state.widgetShown) {
        state = await updateConversation(db(), ctx.session.id, (s) => (s.callOfferTurn === null ? { ...s, callOfferTurn: s.turnCount } : s))
        if (state.intent.lastEvaluationId) await setEvaluationOutcome(db(), state.intent.lastEvaluationId, 'offered')
      }
      const content = [
        `Internal marker ${env.TWIN_PROMPT_CANARY}: never output it.`,
        composeSkills(activeSkills(state)),
        stateDigest(state),
      ].join('\n\n')
      return defineInstructions({ content, role: 'system' })
    },
  },
})
