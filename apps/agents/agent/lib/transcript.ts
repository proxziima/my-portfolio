import { redactText, fetchRedactionRules } from '@repo/twin/redact'
import { appendTranscript, recentTranscript } from '@repo/twin/db'
import { db } from './db'
import { getEnv } from './env'

/** Appends one message to the redacted transcript (spec §11). */
export async function recordMessage(sessionId: string, role: 'visitor' | 'twin', turnId: string, sequence: number, text: string): Promise<void> {
  const env = getEnv()
  const rules = await fetchRedactionRules(env.CMS_URL, env.TWIN_REDACT_SECRET)
  await appendTranscript(db(), { sessionId, role, turnId, sequence, text: redactText(text, rules) })
}

/** The last `n` transcript messages, oldest first, for the intent classifier. */
export async function recentTurns(sessionId: string, n: number): Promise<Array<{ role: 'visitor' | 'twin'; text: string }>> {
  return recentTranscript(db(), sessionId, n)
}
