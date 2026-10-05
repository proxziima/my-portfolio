import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import { ConversationState, type VisitorKind } from '../../contract/state'
import type { TwinDb } from '../client'
import { conversations, visitors } from '../schema'

/** Creates an anonymous visitor and returns its id (the signed cookie carries it). */
export async function createVisitor(db: TwinDb): Promise<string> {
  const [row] = await db.insert(visitors).values({}).returning({ id: visitors.id })
  if (!row) throw new Error('Visitor insert returned no row')
  return row.id
}

/** True when the visitor still exists; a purged cookie must mint a fresh visitor. */
export async function visitorExists(db: TwinDb, visitorId: string): Promise<boolean> {
  const rows = await db.select({ id: visitors.id }).from(visitors).where(eq(visitors.id, visitorId))
  return rows.length === 1
}

/** Marks activity; retention is measured from the last visit, not the first. */
export async function touchVisitor(db: TwinDb, visitorId: string, now = new Date()): Promise<void> {
  await db.update(visitors).set({ lastSeenAt: now }).where(eq(visitors.id, visitorId))
}

/** Stores the HMAC of a volunteered stable identifier to recognise the person on other devices. */
export async function setStableKeyHash(db: TwinDb, visitorId: string, keyHash: string): Promise<void> {
  await db.update(visitors).set({ stableKeyHash: keyHash }).where(eq(visitors.id, visitorId))
}

/** What the twin remembers about a returning visitor, derived from their earlier sessions. */
export interface VisitorHistory {
  visits: number
  name: string | undefined
  company: string | undefined
  role: string | undefined
  kind: VisitorKind | undefined
  topics: string[]
  booked: boolean
  declinedCall: boolean
}

/**
 * Summarises previous sessions for this visitor. Details (name, company, topics, booking...) come only
 * from sessions of the same visitor id, i.e. the signed cookie. The stable key is an HMAC of an email
 * the visitor typed and nobody verified, so anyone could type someone else's email: sessions of other
 * visitors sharing the key only add to `visits` ("good to see you again") and never reveal anything.
 * Each source is capped at 10 sessions, so `visits` tops out at 20. Derived on read so there is no
 * second copy of conversation data to keep in sync.
 */
export async function recallVisitorHistory(
  db: TwinDb,
  visitorId: string,
  currentSessionId: string,
): Promise<VisitorHistory | null> {
  const [self] = await db.select().from(visitors).where(eq(visitors.id, visitorId))
  if (!self) return null
  const rows = await db
    .select({ state: conversations.state })
    .from(conversations)
    .where(and(eq(conversations.visitorId, visitorId), ne(conversations.sessionId, currentSessionId)))
    .orderBy(desc(conversations.updatedAt))
    .limit(10)
  const linked = self.stableKeyHash
    ? await db
        .select({ sessionId: conversations.sessionId })
        .from(conversations)
        .where(and(ne(conversations.visitorId, visitorId), inArray(conversations.visitorId, db.select({ id: visitors.id }).from(visitors).where(eq(visitors.stableKeyHash, self.stableKeyHash)))))
        .limit(10)
    : []
  if (rows.length === 0 && linked.length === 0) return null
  const states = rows.map((r) => ConversationState.parse(r.state))
  const pick = <K extends keyof ConversationState['visitor']>(k: K) => states.find((s) => s.visitor[k] !== undefined)?.visitor[k]
  return {
    visits: states.length + linked.length,
    name: pick('name'),
    company: pick('company'),
    role: pick('role'),
    kind: pick('kind'),
    topics: [...new Set(states.flatMap((s) => s.topicsCited))].slice(0, 8),
    booked: states.some((s) => s.booking.status === 'confirmed' || s.booking.status === 'rescheduled'),
    declinedCall: states.some((s) => s.callOfferDeclined),
  }
}
