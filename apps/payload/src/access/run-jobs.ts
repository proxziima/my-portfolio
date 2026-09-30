import type { PayloadRequest } from 'payload'

/** Signed-in users, or an external cron presenting `Authorization: Bearer $CRON_SECRET`. */
export const canRunJobs = ({ req }: { req: PayloadRequest }): boolean => {
  if (req.user) return true
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`
}
