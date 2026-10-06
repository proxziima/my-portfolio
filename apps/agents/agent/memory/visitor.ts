import { recallVisitorHistory, updateConversation } from '@repo/twin/db'
import { defineMemory, defineMemoryProvider } from 'eve/memory'
import { byPrincipal } from 'eve/memory/scope'
import { ensureConversation } from '../lib/conversation'
import { db } from '../lib/db'
import { visitorIdOf, type Principal } from '../lib/identity'
import { recallText } from '../lib/memory'
import { untrustedKey } from '../lib/untrusted'

/**
 * Long-term memory for returning visitors (spec §8), derived from their earlier conversations in
 * Postgres, so there is no second copy to keep consistent or to purge separately.
 *
 * Failure policy: a throwing recall fails the turn before the model call. We keep that on purpose
 * (fail closed, like the conversation hook): a database that can't answer here can't serve the turn
 * either, and silently dropping the memory would greet a returning visitor as a stranger. So errors
 * are logged with the session id and rethrown.
 */
const provider = defineMemoryProvider({
  recall: {
    async 'turn.started'(ctx) {
      try {
        const principal = ctx.session.auth.current as Principal | null
        const visitorId = visitorIdOf(principal)
        if (!visitorId) return null
        const history = await recallVisitorHistory(db(), visitorId, ctx.session.id)
        if (!history) return null
        // Recall may run before the conversation hook has created this session's row; the call is
        // idempotent, and the flag write below is too (already-true state is left untouched).
        await ensureConversation(ctx.session.id, principal)
        await updateConversation(db(), ctx.session.id, (s) => (s.returningVisitor ? s : { ...s, returningVisitor: true }))
        return { messages: [{ id: 'returning-visitor', content: recallText(history, untrustedKey()) }] }
      } catch (err) {
        console.error(`[memory] visitor recall failed for session ${ctx.session.id}; failing the turn`, err)
        throw err
      }
    },
  },
})

export default defineMemory({ description: 'What earlier visits by this visitor established.', provider, scope: byPrincipal })
