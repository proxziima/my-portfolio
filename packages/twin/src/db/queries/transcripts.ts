import { desc, eq } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { transcripts } from '../schema'

/** Appends one already-redacted message; duplicates from at-least-once hooks are ignored. */
export async function appendTranscript(
  db: TwinDb,
  m: { sessionId: string; role: 'visitor' | 'twin'; turnId: string; sequence: number; text: string },
): Promise<void> {
  await db.insert(transcripts).values(m).onConflictDoNothing()
}

/** The last `n` transcript messages of a session, oldest first. */
export async function recentTranscript(
  db: TwinDb,
  sessionId: string,
  n: number,
): Promise<Array<{ role: 'visitor' | 'twin'; text: string }>> {
  const rows = await db
    .select({ role: transcripts.role, text: transcripts.text })
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .orderBy(desc(transcripts.id))
    .limit(n)
  return rows.reverse().map((r) => ({ role: r.role === 'visitor' ? 'visitor' : 'twin', text: r.text }))
}
