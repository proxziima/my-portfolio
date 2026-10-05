/** The conversation's recorded booking, as far as the transition decision cares. */
export interface StateBooking {
  uid?: string
  status: string
}

/** What a Cal.com booking event still owes the conversation. */
export interface BookingTransition {
  /** The conversation's `state.booking` must be written. */
  write: boolean
  /** The outcome and the notice are due: the transition was not already recorded. */
  notify: boolean
}

/**
 * Idempotency lives in the conversation state, not the bookings row: the row commits first, so a
 * redelivery after a partial failure sees an unchanged row but a stale state. When `state.booking`
 * already holds this uid and status, an earlier delivery finished its write and nothing is owed;
 * anything else is written and announced.
 */
export function bookingTransition(
  stateBooking: StateBooking | null | undefined,
  uid: string,
  status: string,
): BookingTransition {
  const recorded = stateBooking?.uid === uid && stateBooking.status === status
  return { write: !recorded, notify: !recorded }
}
