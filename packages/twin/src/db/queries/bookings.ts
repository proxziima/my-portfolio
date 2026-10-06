import { eq } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { bookings } from '../schema'

/** What an upsert did to a booking's stored status. */
export interface BookingChange {
  /** The status stored before this event, or null when the booking is new. */
  previous: string | null
  /** The status stored after this event. */
  current: string
  /** False for a redelivered event, or a late one for a cancelled booking: nothing to announce. */
  changed: boolean
}

/**
 * Upserts a booking by Cal.com uid; only ids, status and times are stored, never attendee PII.
 * Cancelled is terminal for a uid: Cal.com gives a reschedule a new uid, so a later create or
 * reschedule for a cancelled uid is a redelivery or out of order and leaves the row alone.
 */
export async function upsertBooking(
  db: TwinDb,
  b: { uid: string; sessionId: string; status: string; startTime: Date | null; endTime: Date | null },
): Promise<BookingChange> {
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(bookings)
      .values(b)
      .onConflictDoNothing({ target: bookings.uid })
      .returning({ uid: bookings.uid })
    if (inserted) return { previous: null, current: b.status, changed: true }
    const [row] = await tx.select().from(bookings).where(eq(bookings.uid, b.uid)).for('update')
    if (!row) throw new Error(`Booking ${b.uid} conflicted but no row was found`)
    if (row.status === 'cancelled') return { previous: row.status, current: row.status, changed: false }
    await tx
      .update(bookings)
      .set({ status: b.status, startTime: b.startTime, endTime: b.endTime, receivedAt: new Date() })
      .where(eq(bookings.uid, b.uid))
    return { previous: row.status, current: b.status, changed: row.status !== b.status }
  })
}
