const DELIVERY_TIMEOUT_MS = 10_000

/**
 * How a POST to the workflow webhook went. eve answers 404 once the hook is no longer pending
 * (the run already settled and ended), which means there is nothing left to wake.
 */
export function deliveryOutcome(httpStatus: number): 'delivered' | 'gone' | 'failed' {
  if (httpStatus >= 200 && httpStatus < 300) return 'delivered'
  return httpStatus === 404 ? 'gone' : 'failed'
}

/** The message of a caught value, for logs (never the value itself, which may hold data). */
export const reason = (e: unknown) => (e instanceof Error ? e.message : 'unknown error')

/** A request body as JSON, or null when it isn't (the shape checks then reject it). */
export function json(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * A 2xx for an event that can never succeed, logged loudly. Providers redeliver anything else, so
 * a non-2xx is kept for transient failures worth retrying.
 */
export function lostCause(message: string): Response {
  console.warn(`[webhooks] ${message}; acknowledged and ignored`)
  return new Response('ignored')
}

/**
 * Runs a provider API call after the decision is committed. A failure is logged, never
 * rethrown: a non-2xx would make the provider redeliver the same event over and over. `what`
 * names the provider and the call, e.g. `photon reply`.
 */
export async function bestEffort(what: string, call: () => Promise<void>): Promise<void> {
  try {
    await call()
  } catch (e) {
    console.error(`[webhooks] ${what} failed: ${reason(e)}`)
  }
}

/** Wakes the approval workflow. Its body reads the decision from the database, not this POST. */
export async function deliver(url: string, approvalId: string, status: string): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId, status }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    const outcome = deliveryOutcome(res.status)
    if (outcome === 'failed')
      console.error(`[webhooks] approval ${approvalId} delivery responded ${res.status}`)
    if (outcome === 'gone')
      console.warn(`[webhooks] approval ${approvalId} workflow is no longer waiting`)
  } catch (e) {
    console.error(`[webhooks] approval ${approvalId} delivery failed: ${reason(e)}`)
  }
}
