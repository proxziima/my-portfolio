import { z } from 'zod'

export const dynamic = 'force-dynamic'

/** Signature headers each provider sends; nothing else (cookies, auth) is forwarded. */
const PROVIDERS = {
  cal: ['content-type', 'x-cal-signature-256', 'x-cal-webhook-version'],
  telegram: ['content-type', 'x-telegram-bot-api-secret-token'],
} as const

/**
 * Public entry points for Cal.com and Telegram webhooks. The agent is not public (its workflow
 * routes are unauthenticated), so these forward raw bodies; the agent verifies signatures.
 * Only TWIN_AGENT_URL is read (a narrow z.url() parse, not the full twinEnv()), so a webhook
 * delivery never depends on unrelated BFF secrets.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (provider !== 'cal' && provider !== 'telegram') return new Response('not found', { status: 404 })
  const agentUrl = z.url().parse(process.env.TWIN_AGENT_URL)
  const headers = new Headers()
  for (const name of PROVIDERS[provider]) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const upstream = await fetch(`${agentUrl}/webhooks/${provider}`, { method: 'POST', headers, body: await request.text(), cache: 'no-store' })
  return new Response(await upstream.text(), { status: upstream.status })
}
