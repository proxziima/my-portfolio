import type { TwinDb } from '../client'
import { transcripts } from '../schema'

/** Appends one already-redacted message; duplicates from at-least-once hooks are ignored. */
export async function appendTranscript(
  db: TwinDb,
  m: { sessionId: string; role: 'visitor' | 'twin'; turnId: string; sequence: number; text: string },
): Promise<void> {
  await db.insert(transcripts).values(m).onConflictDoNothing()
}
