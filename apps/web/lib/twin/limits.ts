import { TWIN_LIMITS, type TwinRefusal } from '@repo/twin/contract'
import { getConversation, hitRateLimit, spendSince, type TwinDb } from '@repo/twin/db'

/** Why a message is refused, or null to let it through (spec §10). */
export type Refusal = TwinRefusal['kind']

/** Start of the UTC day, the window for the spend cap. */
const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

/**
 * All per-message guardrails in one place, cheapest first. Each hit is durable (Postgres), so
 * limits survive restarts and apply across instances.
 */
export async function checkMessage(
  db: TwinDb,
  m: { ip: string; sessionId: string | null; text: string; dailySpendUsd: number; now: Date },
): Promise<Refusal | null> {
  if (m.text.length > TWIN_LIMITS.messageMaxChars) return 'too_long'
  if (m.sessionId) {
    const conversation = await getConversation(db, m.sessionId)
    if (!conversation || conversation.state.ended || conversation.state.turnCount >= TWIN_LIMITS.maxTurnsPerConversation) return 'ended'
  }
  if ((await spendSince(db, startOfUtcDay(m.now))) >= m.dailySpendUsd) return 'offline'
  const counts = await Promise.all([
    hitRateLimit(db, `ip:${m.ip}:m`, 60, m.now),
    hitRateLimit(db, `ip:${m.ip}:d`, 86_400, m.now),
    m.sessionId ? hitRateLimit(db, `s:${m.sessionId}:m`, 60, m.now) : Promise.resolve(0),
    m.sessionId ? hitRateLimit(db, `s:${m.sessionId}:d`, 86_400, m.now) : Promise.resolve(0),
  ])
  const [ipMin, ipDay, sMin, sDay] = counts
  if ((ipMin ?? 0) > TWIN_LIMITS.ipPerMinute || (ipDay ?? 0) > TWIN_LIMITS.ipPerDay) return 'throttled'
  if ((sMin ?? 0) > TWIN_LIMITS.sessionPerMinute || (sDay ?? 0) > TWIN_LIMITS.sessionPerDay) return 'throttled'
  return null
}
