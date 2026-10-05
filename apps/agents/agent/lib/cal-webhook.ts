import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/** Constant-time check of `X-Cal-Signature-256`: hex HMAC-SHA256 of the raw body. */
export function verifyCalSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

const BookingTrigger = z.enum(['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'])
type BookingTrigger = z.infer<typeof BookingTrigger>

// Cal.com's envelope is `{ triggerEvent, createdAt, payload }`. Objects strip unknown keys, so
// attendee data and everything else Cal.com sends is dropped at the boundary. Times must carry an
// offset because they end up in `ConversationState.booking.startTime`.
const Envelope = z.object({
  triggerEvent: BookingTrigger,
  payload: z.object({
    uid: z.string().min(1),
    startTime: z.iso.datetime({ offset: true }),
    endTime: z.iso.datetime({ offset: true }),
    metadata: z.object({ bookingRef: z.string().min(1) }),
  }),
})

/** The booking fields the twin keeps from a Cal.com webhook. */
export interface CalBooking {
  trigger: BookingTrigger
  uid: string
  startTime: string
  endTime: string
  bookingRef: string
}

/** The booking fields the twin keeps; other triggers (pings, meeting events) return null. */
export function parseCalWebhook(json: unknown): CalBooking | null {
  const trigger = BookingTrigger.safeParse(
    (json as { triggerEvent?: unknown } | null)?.triggerEvent,
  )
  if (!trigger.success) return null
  const e = Envelope.parse(json)
  return {
    trigger: e.triggerEvent,
    uid: e.payload.uid,
    startTime: e.payload.startTime,
    endTime: e.payload.endTime,
    bookingRef: e.payload.metadata.bookingRef,
  }
}

/** Conversation booking status for a Cal.com trigger. */
export function bookingStatusOf(
  trigger: BookingTrigger,
): 'confirmed' | 'rescheduled' | 'cancelled' {
  return trigger === 'BOOKING_CREATED'
    ? 'confirmed'
    : trigger === 'BOOKING_RESCHEDULED'
      ? 'rescheduled'
      : 'cancelled'
}
