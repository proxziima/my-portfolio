import type { ApprovalRecord, DecidedApproval } from '@repo/twin/db'

/** The audit actor recorded for a decision tapped in Telegram. */
export function telegramActor(fromId: string): string {
  return `telegram:${fromId}`
}

/** What the Telegram route does once it has tried to commit the owner's tap. */
export interface DecisionPlan {
  /** The workflow webhook to wake, or null when there is nothing (left) to deliver. */
  deliverTo: string | null
  /** Text for `answerCallbackQuery`, which stops the button spinner. */
  answer: string
  /** Replacement text for the request message, or null to leave it alone. */
  markText: string | null
  /** Set when the decision is recorded but cannot be delivered; the route logs it. */
  error: string | null
}

const verb = (status: 'approved' | 'denied' | 'expired') =>
  status === 'approved' ? 'Approved' : status === 'denied' ? 'Denied' : 'Expired'

/**
 * Plans the route's side effects from the commit result. `decided` is what `decideApproval`
 * returned; `stored` is the row read back when it returned null (already settled or unknown).
 *
 * A settled row that carries this very decision by this very owner is a redelivery (or a second
 * tap) after a failed delivery, so it is delivered again: a resolved workflow hook ignores extra
 * POSTs. Anything else that was already settled (the deadline won, or the other button) is left
 * alone. A missing webhook never throws, as the decision is already committed and the workflow
 * reads it from the database at its deadline anyway.
 */
export function planDecision(
  tap: { status: 'approved' | 'denied'; fromId: string },
  decided: DecidedApproval | null,
  stored: ApprovalRecord | null,
): DecisionPlan {
  if (decided) {
    return {
      deliverTo: decided.webhookUrl,
      answer: verb(decided.status),
      markText: `${verb(decided.status)}: ${decided.sourceId}`,
      error: decided.webhookUrl
        ? null
        : `Approval ${decided.id} was decided but has no delivery webhook`,
    }
  }
  const sameDecision =
    stored !== null && stored.status === tap.status && stored.actor === telegramActor(tap.fromId)
  if (!sameDecision)
    return { deliverTo: null, answer: 'Already settled.', markText: null, error: null }
  return {
    deliverTo: stored.webhookUrl,
    answer: 'Already settled.',
    markText: `${verb(tap.status)}: ${stored.sourceId}`,
    error: stored.webhookUrl
      ? null
      : `Approval ${stored.id} was decided but has no delivery webhook`,
  }
}

/**
 * How a POST to the workflow webhook went. eve answers 404 once the hook is no longer pending
 * (the run already settled and ended), which means there is nothing left to wake.
 */
export function deliveryOutcome(httpStatus: number): 'delivered' | 'gone' | 'failed' {
  if (httpStatus >= 200 && httpStatus < 300) return 'delivered'
  return httpStatus === 404 ? 'gone' : 'failed'
}
