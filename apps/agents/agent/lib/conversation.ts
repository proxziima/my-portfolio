import { createConversation, getConversation, updateConversation, visitorExists, schema } from '@repo/twin/db'
import type { ConversationState, TwinIdentity } from '@repo/twin/contract'
import { db } from './db'
import { visitorIdOf, type Principal } from './identity'
import { untrusted } from './untrusted'

/**
 * Makes sure the session has its visitor and conversation rows. The BFF creates both for web
 * visitors; this covers `eve dev` and evals, and is idempotent for replays.
 */
export async function ensureConversation(sessionId: string, principal: Principal | null): Promise<ConversationState> {
  const existing = await getConversation(db(), sessionId)
  if (existing) return existing.state
  const visitorId = visitorIdOf(principal)
  if (!visitorId) throw new Error(`Session ${sessionId} has no conversation and no visitor principal`)
  if (!(await visitorExists(db(), visitorId))) {
    await db().insert(schema.visitors).values({ id: visitorId }).onConflictDoNothing()
  }
  await createConversation(db(), sessionId, visitorId)
  const created = await getConversation(db(), sessionId)
  if (!created) throw new Error(`Conversation ${sessionId} vanished after creation`)
  return created.state
}

/** Counts a turn exactly once, even when the hook is delivered twice. */
export async function countTurn(sessionId: string, turnId: string): Promise<void> {
  await updateConversation(db(), sessionId, (s) => (s.lastTurnId === turnId ? s : { ...s, turnCount: s.turnCount + 1, lastTurnId: turnId }))
}

/** Grounding (who I am and how I write) as untrusted CMS data; rendered per turn, cached per process. */
export function groundingBlock(id: TwinIdentity, key: string): string {
  const facts = [
    `name: ${id.name}`,
    id.headline ? `headline: ${id.headline}` : null,
    id.location ? `based in: ${id.location}` : null,
    id.currentRoles.length > 0 ? `current roles: ${id.currentRoles.map((r) => `${r.title} at ${r.company}`).join('; ')}` : null,
  ].filter(Boolean)
  const voice = id.voiceSamples.length > 0 ? `\n<voice_samples>\n${id.voiceSamples.map((v) => untrusted('voice', v, key)).join('\n')}\n</voice_samples>` : ''
  return `<grounding>\n${untrusted('profile', facts.join('\n'), key)}${voice}\n</grounding>`
}
