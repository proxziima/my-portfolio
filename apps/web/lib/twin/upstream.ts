import 'server-only'
import { twinEnv } from './env'
import { mintVisitorJwt, safeTimeZone } from './jwt'

/** What a proxied call to the agent carries besides the visitor. */
export interface AgentRequest {
  method: 'GET' | 'POST'
  body?: unknown
  tz?: string | null
  search?: string
  signal?: AbortSignal
}

/** Calls the agent's eve routes as this visitor. The agent is only reachable from the server. */
export async function agentFetch(path: string, visitorId: string, init: AgentRequest): Promise<Response> {
  const env = twinEnv()
  const token = await mintVisitorJwt(visitorId, safeTimeZone(init.tz), env.TWIN_JWT_SECRET)
  return fetch(`${env.TWIN_AGENT_URL}/eve/v1/${path}${init.search ?? ''}`, {
    method: init.method,
    headers: { authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
    cache: 'no-store',
  })
}

const isNotReady = async (r: Response) =>
  r.status === 409 && ((await r.clone().json().catch(() => null)) as { code?: unknown } | null)?.code === 'session_not_ready'

/**
 * POSTs a turn to a session that may still be starting. eve answers 409 `session_not_ready` until
 * the new session accepts messages; its own client retries that only for follow-ups, never on
 * create, so the BFF's create-then-send must retry here (same schedule as eve's `postSessionSend`:
 * 250 ms doubling to 2 s, for up to 20 s).
 */
export async function agentSendWhenReady(sessionId: string, visitorId: string, init: Omit<AgentRequest, 'method'>): Promise<Response> {
  const deadline = Date.now() + 20_000
  for (let delay = 250; ; delay = Math.min(delay * 2, 2_000)) {
    const res = await agentFetch(`session/${sessionId}`, visitorId, { ...init, method: 'POST' })
    const left = deadline - Date.now()
    if (left <= 0 || !(await isNotReady(res))) return res
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, left)))
  }
}
