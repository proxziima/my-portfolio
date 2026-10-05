import type { TwinDb } from '../client'
import { bookings } from '../schema'

/** Upserts a booking by Cal.com uid; only ids, status and times are stored, never attendee PII. */
export async function upsertBooking(
  db: TwinDb,
  b: { uid: string; sessionId: string; status: string; startTime: Date | null; endTime: Date | null },
): Promise<void> {
  await db
    .insert(bookings)
    .values(b)
    .onConflictDoUpdate({ target: bookings.uid, set: { status: b.status, startTime: b.startTime, endTime: b.endTime, receivedAt: new Date() } })
}
