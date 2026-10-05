import { and, eq } from 'drizzle-orm'
import { ConversationState, initialConversationState } from '../../contract/state'
import type { TwinDb } from '../client'
import { conversations } from '../schema'

/** Records that a visitor owns a new eve session; idempotent for retried creates. */
export async function createConversation(db: TwinDb, sessionId: string, visitorId: string): Promise<void> {
  await db
    .insert(conversations)
    .values({ sessionId, visitorId, state: initialConversationState() })
    .onConflictDoNothing()
}

/** Loads and validates a conversation; null when the session is unknown (or purged). */
export async function getConversation(
  db: TwinDb,
  sessionId: string,
): Promise<{ visitorId: string; state: ConversationState } | null> {
  const [row] = await db.select().from(conversations).where(eq(conversations.sessionId, sessionId))
  return row ? { visitorId: row.visitorId, state: ConversationState.parse(row.state) } : null
}

/**
 * Applies a pure update under a row lock and validates the result before writing, so concurrent
 * writers (tools, hooks, webhooks) never lose updates or persist an invalid record.
 */
export async function updateConversation(
  db: TwinDb,
  sessionId: string,
  update: (state: ConversationState) => ConversationState,
): Promise<ConversationState> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(conversations).where(eq(conversations.sessionId, sessionId)).for('update')
    if (!row) throw new Error(`Unknown conversation ${sessionId}`)
    const next = ConversationState.parse(update(ConversationState.parse(row.state)))
    await tx.update(conversations).set({ state: next, updatedAt: new Date() }).where(eq(conversations.sessionId, sessionId))
    return next
  })
}

/** True when the session belongs to the visitor; the BFF checks this on every proxied call. */
export async function ownsSession(db: TwinDb, sessionId: string, visitorId: string): Promise<boolean> {
  const rows = await db
    .select({ sessionId: conversations.sessionId })
    .from(conversations)
    .where(and(eq(conversations.sessionId, sessionId), eq(conversations.visitorId, visitorId)))
  return rows.length === 1
}

/** All eve session ids a visitor owns (used by the deletion endpoint to reset them). */
export async function listVisitorSessions(db: TwinDb, visitorId: string): Promise<string[]> {
  const rows = await db.select({ sessionId: conversations.sessionId }).from(conversations).where(eq(conversations.visitorId, visitorId))
  return rows.map((r) => r.sessionId)
}
