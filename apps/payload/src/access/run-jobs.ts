import { createHash, timingSafeEqual } from 'crypto'
import type { PayloadRequest } from 'payload'

const digest = (value: string): Buffer => createHash('sha256').update(value).digest()

/** Signed-in users, or an external cron presenting `Authorization: Bearer $CRON_SECRET`. */
export const canRunJobs = ({ req }: { req: PayloadRequest }): boolean => {
  if (req.user) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  // Hashing gives equal-length buffers, so the comparison is constant-time whatever was sent.
  return timingSafeEqual(digest(req.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`))
}
