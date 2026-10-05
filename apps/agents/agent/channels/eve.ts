import { TWIN_LIMITS } from '@repo/twin/contract'
import { updateConversation } from '@repo/twin/db'
import type { UserContent } from 'ai'
import { localDev } from 'eve/channels/auth'
import { defaultEveAuth, eveChannel } from 'eve/channels/eve'
import { classifyAbuse, closingContext, countsAsViolation, deflectionContext, offScopeContext } from '../lib/abuse'
import { ensureConversation } from '../lib/conversation'
import { db } from '../lib/db'
import { getEnv } from '../lib/env'
import { visitorAuth } from '../lib/visitor-auth'

/** The text of a user message, whether eve passes a string or content parts. */
function textOf(message: string | UserContent): string {
  if (typeof message === 'string') return message
  return message.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
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
    const auth = defaultEveAuth(ctx)
    const sessionId = ctx.eve.sessionId
    // The web BFF always creates the session without a message and then sends to /session/:id,
    // so only `eve dev` or direct callers reach this point without a session id and skip the gate.
    if (!sessionId) return { auth }
    // The BFF creates the row for web visitors; `eve dev` sessions may not have one yet.
    const current = await ensureConversation(sessionId, auth)
    if (current.ended) return { auth, context: [closingContext()] }
    const verdict = await classifyAbuse(textOf(message), getEnv().TWIN_ABUSE_TIMEOUT_MS)
    if (verdict === 'ok') return { auth }
    if (!countsAsViolation(verdict)) return { auth, context: [offScopeContext()] }
    const state = await updateConversation(db(), sessionId, (s) => {
      const violations = s.violations + 1
      return { ...s, violations, ended: s.ended || violations >= TWIN_LIMITS.maxViolations }
    })
    return { auth, context: [deflectionContext(verdict, state.ended)] }
  },
})
