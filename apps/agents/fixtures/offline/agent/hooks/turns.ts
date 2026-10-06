import { defineHook } from 'eve/hooks'
import { countTurn, ensureConversation, pruneSettledApprovals } from '../../../../agent/lib/conversation'
import type { Principal } from '../../../../agent/lib/identity'

/**
 * Turn bookkeeping only. The real conversation hook also transcribes and runs the intent
 * classifier, which call the CMS and OpenRouter; those are covered by unit tests instead.
 */
export default defineHook({
  events: {
    async 'turn.started'(event, ctx) {
      try {
        await ensureConversation(ctx.session.id, ctx.session.auth.current as Principal | null)
        await countTurn(ctx.session.id, event.data.turnId)
        await pruneSettledApprovals(ctx.session.id)
      } catch (err) {
        // Fail closed like the real hook: a turn without its state row must not reach the model.
        console.error(`[fixture] turn.started failed for session ${ctx.session.id}; cancelling the turn`, err)
        ctx.cancel()
        throw err
      }
    },
  },
})
