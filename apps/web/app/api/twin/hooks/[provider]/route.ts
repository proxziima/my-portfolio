import { z } from 'zod'

export const dynamic = 'force-dynamic'

/** Statuses the Fetch standard forbids a body on. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304])

/** Headers each provider needs (signature and event metadata); nothing else (cookies, auth) is forwarded. */
const PROVIDERS = {
  cal: ['content-type', 'x-cal-signature-256', 'x-cal-webhook-version'],
  photon: ['content-type', 'x-spectrum-signature', 'x-spectrum-timestamp', 'x-spectrum-event', 'x-spectrum-webhook-id'],
} as const

/**
 * Public entry points for Cal.com and Photon webhooks. The agent is not public (its workflow
 * routes are unauthenticated), so these forward raw bodies; the agent verifies signatures.
 * Only TWIN_AGENT_URL is read (a narrow z.url() parse, not the full twinEnv()), so a webhook
 * delivery never depends on unrelated BFF secrets.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  // hasOwn, not `in`: a path segment like `constructor` or `__proto__` must not resolve to a prototype member.
  if (!Object.hasOwn(PROVIDERS, provider)) return new Response('not found', { status: 404 })
  const names = PROVIDERS[provider as keyof typeof PROVIDERS]
  const agentUrl = z.url().parse(process.env.TWIN_AGENT_URL)
  const headers = new Headers()
  for (const name of names) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const upstream = await fetch(`${agentUrl}/webhooks/${provider}`, { method: 'POST', headers, body: await request.text(), cache: 'no-store' })
  // A null-body status (the Photon adapter acks receipts and typing events with 204) may carry no
  // body at all; even an empty string makes the Response constructor throw, which would turn every
  // such ack into a 500 and make the provider back off the webhook.
  const body = NULL_BODY_STATUSES.has(upstream.status) ? null : await upstream.text()
  return new Response(body, { status: upstream.status })
}
