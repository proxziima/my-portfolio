import { defineHook } from 'eve/hooks'
import { countTurn, ensureConversation, pruneSettledApprovals } from '../lib/conversation'
import type { Principal } from '../lib/identity'
import { evaluateCallIntent } from '../lib/intent/evaluate'
import { recordMessage } from '../lib/transcript'

/**
 * Conversation bookkeeping: turn count, stale approval entries, redacted transcript, and post-reply
 * intent evaluation.
 */
export default defineHook({
  events: {
    async 'turn.started'(event, ctx) {
      try {
        await ensureConversation(ctx.session.id, ctx.session.auth.current as Principal | null)
        await countTurn(ctx.session.id, event.data.turnId)
        // Before the instructions resolver renders state: no pending entry outlives its approval.
        await pruneSettledApprovals(ctx.session.id)
      } catch (err) {
        // Without its state row the turn can't be guarded or counted: stop it before the model call.
        console.error(`[conversation] turn.started failed for session ${ctx.session.id}; cancelling the turn`, err)
        ctx.cancel()
        throw err
      }
    },
    // The message handlers never cancel: a lost transcript line or evaluation must not break the
    // visitor's turn. They log with the session id and rethrow so eve records the failure too.
    async 'message.received'(event, ctx) {
      try {
        await recordMessage(ctx.session.id, 'visitor', event.data.turnId, event.data.sequence, event.data.message)
      } catch (err) {
        console.error(`[conversation] message.received transcript failed for session ${ctx.session.id}`, err)
        throw err
      }
    },
    async 'message.completed'(event, ctx) {
      // Interim narration before tool calls is not a reply; only final blocks are evaluated.
      if (event.data.finishReason === 'tool-calls') return
      try {
        await recordMessage(ctx.session.id, 'twin', event.data.turnId, event.data.sequence, event.data.message)
        await evaluateCallIntent(ctx.session.id, event.data.turnId, event.data.sequence)
      } catch (err) {
        console.error(`[conversation] message.completed bookkeeping failed for session ${ctx.session.id}`, err)
        throw err
      }
    },
  },
})
