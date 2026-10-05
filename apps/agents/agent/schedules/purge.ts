import { TWIN_LIMITS } from '@repo/twin/contract'
import { purgeExpired } from '@repo/twin/db'
import { defineSchedule } from 'eve/schedules'
import { db } from '../lib/db'

/** Daily 90-day retention purge (spec §8). eve run data has its own retention (agent.ts). */
export default defineSchedule({
  cron: '0 3 * * *',
  async run() {
    try {
      const purged = await purgeExpired(db(), new Date(), TWIN_LIMITS.retentionDays)
      console.info(
        `[twin] retention purge: ${purged.visitors} visitors, ${purged.rateLimits} rate windows, ${purged.spend} spend rows`,
      )
    } catch (error) {
      // Fail loudly: log, then rethrow so the cron run is recorded as failed.
      console.error('[twin] retention purge failed', error)
      throw error
    }
  },
})
