import { z } from 'zod'

/**
 * A system event delivered into a session as a message (eve has no system-role channel send).
 * The window renders it as an MSN system line. Behaviour never reads it, so a spoof is harmless.
 */
export const TwinNotice = z.object({
  twinNotice: z.literal(1),
  kind: z.enum(['booking.confirmed', 'booking.rescheduled', 'booking.cancelled']),
  startTime: z.string().optional(),
})
export type TwinNotice = z.infer<typeof TwinNotice>

/** Serialises a notice into the message text sent through `attachSession().send`. */
export function encodeNotice(notice: Omit<TwinNotice, 'twinNotice'>): string {
  return JSON.stringify(TwinNotice.parse({ twinNotice: 1, ...notice }))
}

/** Parses message text as a notice; ordinary text (the common case) returns null. */
export function parseNotice(text: string): TwinNotice | null {
  if (!text.startsWith('{"twinNotice":1')) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = TwinNotice.safeParse(raw)
  return parsed.success ? parsed.data : null
}
