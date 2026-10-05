import { defineHook } from 'eve/hooks'
import { countTurn, ensureConversation } from '../lib/conversation'
import type { Principal } from '../lib/identity'

/** Conversation bookkeeping: counts turns. C9 adds intent evaluation and C12 transcripts. */
export default defineHook({
  events: {
    async 'turn.started'(event, ctx) {
      await ensureConversation(ctx.session.id, ctx.session.auth.current as Principal | null)
      await countTurn(ctx.session.id, event.data.turnId)
    },
  },
})
