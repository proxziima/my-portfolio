import { desc, eq } from 'drizzle-orm'
import type { EvaluationOutcome, IntentClass, IntentTier } from '../../contract/intent'
import type { TwinDb } from '../client'
import { intentEvaluations } from '../schema'

/** One evaluation row; `reasons` must be non-empty (also enforced by a DB check constraint). */
export interface NewEvaluation {
  sessionId: string
  turnId: string
  sequence: number
  score: number
  tier: IntentTier
  classification: IntentClass | null
  reasons: string[]
  signals: Record<string, unknown>
  latencyMs: number | null
  outcome?: EvaluationOutcome
}

/** Inserts an evaluation; returns null when this message was already evaluated (at-least-once hooks). */
export async function insertEvaluation(db: TwinDb, e: NewEvaluation): Promise<string | null> {
  if (e.reasons.length === 0) throw new Error('An evaluation needs at least one reason')
  const rows = await db
    .insert(intentEvaluations)
    .values({ ...e, outcome: e.outcome ?? 'none' })
    .onConflictDoNothing()
    .returning({ id: intentEvaluations.id })
  return rows[0]?.id ?? null
}

/** Records what happened after an evaluation, which is the label the weights are tuned against. */
export async function setEvaluationOutcome(db: TwinDb, id: string, outcome: EvaluationOutcome): Promise<void> {
  await db.update(intentEvaluations).set({ outcome }).where(eq(intentEvaluations.id, id))
}

/** The most recent evaluation id of a session, or null. */
export async function latestEvaluationId(db: TwinDb, sessionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: intentEvaluations.id })
    .from(intentEvaluations)
    .where(eq(intentEvaluations.sessionId, sessionId))
    .orderBy(desc(intentEvaluations.createdAt))
    .limit(1)
  return row?.id ?? null
}
