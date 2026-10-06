import { REFUSAL_STATUS, TwinRefusal } from '@repo/twin/contract'
import { createConversation, ownsSession, touchVisitor, updateConversation } from '@repo/twin/db'
import { fetchRedactionRules } from '@repo/twin/redact'
import { z } from 'zod'
import { twinDb } from '@/lib/twin/db'
import { twinEnv } from '@/lib/twin/env'
import { createEventFilter, filterStream } from '@/lib/twin/filter'
import { checkCreate, checkMessage, type Refusal } from '@/lib/twin/limits'
import { neutraliseVisitorText } from '@/lib/twin/neutralise'
import { agentFetch, agentSendWhenReady } from '@/lib/twin/upstream'
import { clientIp, currentVisitor, existingVisitor } from '@/lib/twin/visitor'

/** Every call is per-visitor and live; nothing here may be cached. */
export const dynamic = 'force-dynamic'

/*
 * eve 0.71 `createMessageBody` (dist/src/client/session.js) puts only `message`, `inputResponses`,
 * `turnPolicy` (follow-ups), `clientContext` and `outputSchema` on the wire, and the last three
 * only when the caller passes them. The twin's client sends text only, so that is all a visitor may
 * send: `.strict()` rejects `inputResponses` (approvals and limits are never theirs to give),
 * `clientContext` (more user-role text to defuse, for nothing), `turnPolicy` and `outputSchema`.
 */
const MessageBody = z.object({ message: z.string().min(1) }).strict()
const CreateBody = z.object({ message: z.string().min(1).optional() }).strict()
const SESSION = /^[\w-]{1,128}$/

type Context = { params: Promise<{ path: string[] }> }

const refuse = (kind: Refusal) => Response.json(TwinRefusal.parse({ ok: false, kind }), { status: REFUSAL_STATUS[kind] })
const notFound = () => Response.json({ ok: false }, { status: 404 })
const badRequest = () => Response.json({ ok: false }, { status: 400 })

/** The turn the agent receives: visitor text with forged context notes defused. */
const turnOf = (message: string) => ({ message: neutraliseVisitorText(message) })

/** Thrown for an upstream 5xx: its body may name hosts or stack frames, so it is never relayed. */
class UpstreamFailure extends Error {}

/** Proxies upstream JSON responses (status, body and session id header); 5xx become `offline`. */
const relay = async (r: Response) => {
  if (r.status >= 500) throw new UpstreamFailure(`agent responded ${r.status}: ${await r.text().catch(() => '')}`)
  const headers = new Headers({ 'content-type': r.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' })
  const session = r.headers.get('x-eve-session-id')
  if (session) headers.set('x-eve-session-id', session)
  return new Response(await r.text(), { status: r.status, headers })
}

/**
 * Any failure past validation (agent unreachable or 5xx, redaction rules unavailable, database)
 * reaches the visitor as the `offline` refusal; the cause is only logged.
 */
const failSafe =
  (name: string, handler: (request: Request, context: Context) => Promise<Response>) =>
  async (request: Request, context: Context): Promise<Response> => {
    try {
      return await handler(request, context)
    } catch (error) {
      console.error(`[twin] ${name} failed`, error)
      return refuse('offline')
    }
  }

/** Creates the eve session and records ownership; if recording fails the orphan is reset. */
async function createSession(visitorId: string, tz: string | null): Promise<{ created: Response; sessionId: string }> {
  // Create without a message first, so the ownership row exists before any turn runs.
  const created = await agentFetch('session', visitorId, { method: 'POST', body: {}, tz })
  if (!created.ok) return { created, sessionId: '' }
  const { sessionId } = z.object({ sessionId: z.string().regex(SESSION) }).parse(await created.clone().json())
  try {
    await createConversation(twinDb(), sessionId, visitorId)
  } catch (error) {
    // Nobody could ever reach a session without its ownership row: retire it rather than leak it.
    const reset = await agentFetch(`session/${sessionId}/reset`, visitorId, { method: 'POST', body: { reason: 'ownership not recorded' } }).then(
      (r) => `answered ${r.status}`,
      (e: unknown) => `failed: ${String(e)}`,
    )
    console.error(`[twin] orphan session ${sessionId} reset ${reset}`)
    throw error
  }
  return { created, sessionId }
}

/** POST /api/twin/eve/v1/session and /session/:id: the only writes a visitor can make. */
export const POST = failSafe('send', async (request, { params }) => {
  const { path } = await params
  const env = twinEnv()
  const tz = request.headers.get('x-twin-tz')
  const ip = clientIp(request)
  const now = new Date()

  if (path.length === 1 && path[0] === 'session') {
    // eve's message-free create (prewarm) has no body at all.
    const parsed = CreateBody.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return badRequest()
    const { message } = parsed.data
    // Every create is counted before anything is created: it is the only path that mints a visitor.
    const refusal =
      (await checkCreate(twinDb(), { ip, now })) ??
      (message ? await checkMessage(twinDb(), { ip, sessionId: null, text: message, dailySpendUsd: env.TWIN_DAILY_SPEND_USD, now }) : null)
    if (refusal) return refuse(refusal)
    const visitorId = await currentVisitor()
    const { created, sessionId } = await createSession(visitorId, tz)
    if (!created.ok || !message) return relay(created)
    return relay(await agentSendWhenReady(sessionId, visitorId, { body: turnOf(message), tz }))
  }

  if (path.length === 2 && path[0] === 'session' && SESSION.test(path[1] ?? '')) {
    const sessionId = path[1] as string
    const visitorId = await existingVisitor()
    if (!visitorId || !(await ownsSession(twinDb(), sessionId, visitorId))) return notFound()
    const parsed = MessageBody.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return badRequest()
    const refusal = await checkMessage(twinDb(), { ip, sessionId, text: parsed.data.message, dailySpendUsd: env.TWIN_DAILY_SPEND_USD, now })
    if (refusal) return refuse(refusal)
    await touchVisitor(twinDb(), visitorId, now)
    return relay(await agentFetch(`session/${sessionId}`, visitorId, { method: 'POST', body: turnOf(parsed.data.message), tz }))
  }
  return notFound()
})

/** Marks the conversation ended; logged and swallowed, so the stream it rides on never breaks. */
const endConversation = (sessionId: string) => {
  updateConversation(twinDb(), sessionId, (s) => ({ ...s, ended: true })).catch((error: unknown) =>
    console.error(`[twin] marking ${sessionId} ended after a session-limit request failed`, error),
  )
}

/** GET /api/twin/eve/v1/session/:id/stream: the filtered, resumable event stream. */
export const GET = failSafe('stream', async (request, { params }) => {
  const { path } = await params
  if (!(path.length === 3 && path[0] === 'session' && SESSION.test(path[1] ?? '') && path[2] === 'stream')) return notFound()
  const sessionId = path[1] as string
  const visitorId = await existingVisitor()
  if (!visitorId || !(await ownsSession(twinDb(), sessionId, visitorId))) return notFound()
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
  // A session-limit request asks for budget only the owner can grant: the visitor's conversation is over.
  const filter = createEventFilter(rules, env.TWIN_PROMPT_CANARY, { onSessionLimit: () => endConversation(sessionId) })
  return new Response(filterStream(upstream.body, filter), { status: upstream.status, headers })
})
