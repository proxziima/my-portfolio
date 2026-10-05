import { defineHook } from 'eve/hooks'
import { countTurn, ensureConversation } from '../lib/conversation'
import type { Principal } from '../lib/identity'

/** Conversation bookkeeping: counts turns. C9 adds intent evaluation and C12 transcripts. */
export default defineHook({
  events: {
    async 'turn.started'(event, ctx) {
      try {
        await ensureConversation(ctx.session.id, ctx.session.auth.current as Principal | null)
        await countTurn(ctx.session.id, event.data.turnId)
      } catch (err) {
        // Without its state row the turn can't be guarded or counted: stop it before the model call.
        console.error(`[conversation] turn.started failed for session ${ctx.session.id}; cancelling the turn`, err)
        ctx.cancel()
        throw err
      }
    },
  },
})
