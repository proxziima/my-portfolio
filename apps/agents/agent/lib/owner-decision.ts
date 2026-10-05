import type { ApprovalRecord, DecidedApproval } from '@repo/twin/db'
import { confirmationText, lateReplyText } from './imessage-reply'

/** The audit actor for a decision the owner texted (only the owner's number is accepted). */
export const OWNER_ACTOR = 'imessage:owner'

/** What the Sendblue route does once it has tried to commit the owner's reply. */
export interface DecisionPlan {
  /** The workflow webhook to wake, or null when there is nothing (left) to deliver. */
  deliverTo: string | null
  /** The text sent back to the owner. */
  reply: string
  /** Set when the decision is recorded but cannot be delivered; the route logs it. */
  error: string | null
}

const noHook = (id: string) => `Approval ${id} was decided but has no delivery webhook`

/**
 * Plans the route's side effects from the commit result. `decided` is what `decideApproval`
 * returned; `stored` is the row read back when it returned null (already settled or unknown).
 *
 * A settled row carrying this very decision by the owner is a redelivery (or a repeated reply)
 * after a failed delivery, so it is delivered again: a resolved workflow hook ignores extra
 * POSTs. Anything else already settled (the deadline won, or the opposite answer) is left alone.
 * A missing webhook never throws, as the decision is already committed and the workflow reads it
 * from the database at its deadline anyway.
 */
export function planDecision(
  status: 'approved' | 'denied',
  decided: DecidedApproval | null,
  stored: ApprovalRecord | null,
): DecisionPlan {
  if (decided) {
    return {
      deliverTo: decided.webhookUrl,
      reply: confirmationText(decided.status, decided.replyCode, decided.topic),
      error: decided.webhookUrl ? null : noHook(decided.id),
    }
  }
  if (!stored || stored.status === 'pending') return { deliverTo: null, reply: 'Nothing changed. Try again.', error: null }
  const sameDecision = stored.status === status && stored.actor === OWNER_ACTOR
  if (!sameDecision) return { deliverTo: null, reply: lateReplyText(stored.status, stored.replyCode), error: null }
  return {
    deliverTo: stored.webhookUrl,
    reply: confirmationText(stored.status, stored.replyCode, stored.topic),
    error: stored.webhookUrl ? null : noHook(stored.id),
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
