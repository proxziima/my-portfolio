/** The conversation's recorded booking, as far as the transition decision cares. */
export interface StateBooking {
  uid?: string
  status: string
  startTime?: string
}

/** A Cal.com booking event after its bookings row was upserted. */
export interface BookingEvent {
  uid: string
  /** The status the conversation would record (cancelled stays terminal). */
  status: string
  startTime: string
  /** `upsertBooking` reported a status change on the bookings row (or inserted it). */
  rowChanged: boolean
}

/** What a Cal.com booking event still owes the conversation. */
export interface BookingTransition {
  /** The conversation's `state.booking` must be written. */
  write: boolean
  /** The outcome and the notice are due: the transition was not already recorded. */
  notify: boolean
}

/** A state without a recorded start time can't tell a move apart, so it never counts as one. */
const sameStart = (recorded: string | undefined, incoming: string): boolean =>
  recorded === undefined || Date.parse(recorded) === Date.parse(incoming)

/**
 * Idempotency lives in the conversation state, not the bookings row: the row commits first, so a
 * redelivery after a partial failure sees an unchanged row but a stale state, and is still written
 * and announced. Two cases owe nothing:
 * - the state already holds this uid, status and start time (an earlier delivery finished);
 * - the row is unchanged while the state holds a different uid: a duplicate or retried event for a
 *   booking the conversation has moved past (created A, rescheduled to B, then A again), which
 *   must not roll the state back nor notify the visitor twice.
 * A same-uid event that only moves the start time is a reschedule and is written and announced.
 */
export function bookingTransition(
  stateBooking: StateBooking | null | undefined,
  event: BookingEvent,
): BookingTransition {
  const recordedUid = stateBooking?.uid
  const stale = !event.rowChanged && recordedUid !== undefined && recordedUid !== event.uid
  const recorded =
    recordedUid === event.uid &&
    stateBooking?.status === event.status &&
    sameStart(stateBooking.startTime, event.startTime)
  const owed = !stale && !recorded
  return { write: owed, notify: owed }
}
