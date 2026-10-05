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
      const state = await ensureConversation(ctx.session.id, ctx.session.auth.current as Principal | null)
      // A warm offer is made at most once: it is marked as made on the turn it is instructed
      // (idempotent across replays), while this turn's digest still shows the pre-update state.
      if (state.intent.tier === 'warm' && !state.callOfferMade && !state.callOfferDeclined && !state.widgetShown) {
        await updateConversation(db(), ctx.session.id, (s) => ({ ...s, callOfferMade: true }))
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
