import { REFUSAL_STATUS, TwinRefusal } from '@repo/twin/contract'
import { createConversation, ownsSession } from '@repo/twin/db'
import { fetchRedactionRules } from '@repo/twin/redact'
import { z } from 'zod'
import { twinDb } from '@/lib/twin/db'
import { twinEnv } from '@/lib/twin/env'
import { createEventFilter, filterStream } from '@/lib/twin/filter'
import { checkMessage, type Refusal } from '@/lib/twin/limits'
import { neutraliseVisitorContext, neutraliseVisitorText } from '@/lib/twin/neutralise'
import { agentFetch, agentSendWhenReady } from '@/lib/twin/upstream'
import { clientIp, currentVisitor } from '@/lib/twin/visitor'

/** Every call is per-visitor and live; nothing here may be cached. */
export const dynamic = 'force-dynamic'

/*
 * eve 0.71 `createMessageBody` (dist/src/client/session.js) puts only `message`, `inputResponses`,
 * `turnPolicy` (follow-ups), `clientContext` and `outputSchema` on the wire, and the last three
 * only when the caller passes them. The twin sends text plus optional clientContext, so that is all
 * a visitor may send: `.strict()` rejects `inputResponses` (approvals and limits are never theirs to
 * give), `turnPolicy` and `outputSchema`.
 */
const ClientContext = z.union([z.string(), z.array(z.string()), z.record(z.string(), z.json())])
const MessageBody = z.object({ message: z.string().min(1), clientContext: ClientContext.optional() }).strict()
const CreateBody = z.object({ message: z.string().min(1).optional(), clientContext: ClientContext.optional() }).strict()
const SESSION = /^[\w-]{1,128}$/

const refuse = (kind: Refusal) => Response.json(TwinRefusal.parse({ ok: false, kind }), { status: REFUSAL_STATUS[kind] })
const notFound = () => Response.json({ ok: false }, { status: 404 })
const badRequest = () => Response.json({ ok: false }, { status: 400 })

/** The turn the agent receives: visitor text with forged context notes defused. */
const turnOf = (b: { message: string; clientContext?: z.infer<typeof ClientContext> }) => ({
  message: neutraliseVisitorText(b.message),
  ...(b.clientContext === undefined ? {} : { clientContext: neutraliseVisitorContext(b.clientContext) }),
})

/** Proxies upstream JSON responses as-is (status, body and session id header). */
const relay = async (r: Response) => {
  const headers = new Headers({ 'content-type': r.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' })
  const session = r.headers.get('x-eve-session-id')
  if (session) headers.set('x-eve-session-id', session)
  return new Response(await r.text(), { status: r.status, headers })
}

/** POST /api/twin/eve/v1/session and /session/:id: the only writes a visitor can make. */
export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const env = twinEnv()
  const visitorId = await currentVisitor()
  const tz = request.headers.get('x-twin-tz')
  const ip = clientIp(request)

  if (path.length === 1 && path[0] === 'session') {
    // eve's message-free create (prewarm) has no body at all.
    const parsed = CreateBody.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return badRequest()
    const { message, clientContext } = parsed.data
    const refusal = message ? await checkMessage(twinDb(), { ip, sessionId: null, text: message, dailySpendUsd: env.TWIN_DAILY_SPEND_USD, now: new Date() }) : null
    if (refusal) return refuse(refusal)
    // Create without a message first, so the ownership row exists before any turn runs.
    const created = await agentFetch('session', visitorId, { method: 'POST', body: {}, tz })
    if (!created.ok) return relay(created)
    const { sessionId } = z.object({ sessionId: z.string().regex(SESSION) }).parse(await created.clone().json())
    await createConversation(twinDb(), sessionId, visitorId)
    if (!message) return relay(created)
    return relay(await agentSendWhenReady(sessionId, visitorId, { body: turnOf({ message, clientContext }), tz }))
  }

  if (path.length === 2 && path[0] === 'session' && SESSION.test(path[1] ?? '')) {
    const sessionId = path[1] as string
    if (!(await ownsSession(twinDb(), sessionId, visitorId))) return notFound()
    const parsed = MessageBody.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return badRequest()
    const refusal = await checkMessage(twinDb(), { ip, sessionId, text: parsed.data.message, dailySpendUsd: env.TWIN_DAILY_SPEND_USD, now: new Date() })
    if (refusal) return refuse(refusal)
    return relay(await agentFetch(`session/${sessionId}`, visitorId, { method: 'POST', body: turnOf(parsed.data), tz }))
  }
  return notFound()
}

/** GET /api/twin/eve/v1/session/:id/stream: the filtered, resumable event stream. */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (!(path.length === 3 && path[0] === 'session' && SESSION.test(path[1] ?? '') && path[2] === 'stream')) return notFound()
  const sessionId = path[1] as string
  const visitorId = await currentVisitor()
  if (!(await ownsSession(twinDb(), sessionId, visitorId))) return notFound()
  const env = twinEnv()
  // Rules first: without them nothing may stream, and no upstream connection is left dangling.
  const rules = await fetchRedactionRules(env.CMS_URL, env.TWIN_REDACT_SECRET)
  const upstream = await agentFetch(`session/${sessionId}/stream`, visitorId, { method: 'GET', search: new URL(request.url).search, signal: request.signal })
  if (!upstream.ok || !upstream.body) return relay(upstream)
  const headers = new Headers({ 'content-type': upstream.headers.get('content-type') ?? 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' })
  for (const h of ['x-eve-session-id', 'x-eve-stream-format', 'x-eve-stream-version', 'x-eve-stream-tail-index']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new Response(filterStream(upstream.body, createEventFilter(rules, env.TWIN_PROMPT_CANARY)), { status: upstream.status, headers })
}
