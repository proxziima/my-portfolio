# Phase D — Web: the BFF and the Messenger window

Part of `2026-10-04-portfolio-twin-agent.md`. Read its "Global conventions" first. `apps/web/AGENTS.md` warns that Next 16.3 differs from what you may know. Read `node_modules/next/dist/docs/` for route handlers and streaming responses before writing D3.

**Context:**

- **Style:** web code uses single quotes and no semicolons, CSS Modules with local tokens, and a JSDoc line on every export. `'use client'` goes on client files and `import 'server-only'` on server modules.
- **Tests:** vitest with `// @vitest-environment jsdom` per file. Hooks are tested with `createRoot` + `act`; there is no Testing Library. Only `tests/unit/**/*.test.ts` is collected, so component tests are `.test.ts` and use `createElement`.
- **Current seam:** `features/os/apps/messenger/Conversation.tsx` builds `scriptedResponder(contact.replies)` and calls `useConversation(respond)`. Both are replaced here. The window manager, the band, the portraits and the compose box stay.
- **eve wire protocol:** see the API notes §11:
  - Session create returns 202 `{ ok, sessionId, status }` plus the `x-eve-session-id` header.
  - Follow-ups go to `POST /session/:id`. Streams are NDJSON at `GET /session/:id/stream?startIndex=N`.
  - `message.appended.data.messageDelta` carries the delta; `message.completed.data.message` carries the full block.
  - The client resumes by absolute event index. **The BFF must never drop or insert events, only rewrite their content.**

---

### Task D1: Server-side twin plumbing (env, db, cookie, JWT)

**Files:**
- Modify: `apps/web/package.json` (deps), `apps/web/next.config.js` (`transpilePackages`), `apps/web/.env.example`, `turbo.json` (no build-time env added: these are runtime-only, so no change). Confirm and leave `turbo.json` unchanged.
- Create: `apps/web/lib/twin/{env,db,cookie,jwt}.ts`
- Test: `apps/web/tests/unit/twin/cookie.test.ts`, `apps/web/tests/unit/twin/jwt.test.ts`

- [ ] **Step 1: Dependencies.** Add to `apps/web/package.json` `dependencies`: `"@repo/twin": "*"`, `"eve": "0.71.0"`, `"jose": "6.2.12"`, `"pg": "8.23.1"`, `"zod": "4.5.4"`. Add to `devDependencies`: `"@electric-sql/pglite": "0.5.8"`. Run `bun install`.

`apps/web/next.config.js`: add `transpilePackages: ['@repo/twin'],` to `nextConfig`, with the comment `// Shared TypeScript source (contract, db, redaction) compiled by Next, like @repo/cms-types.`

Append to `apps/web/.env.example`:
```
# --- Portfolio twin BFF (server-only; never NEXT_PUBLIC_) ---
# Internal URL of the agents service (docker network in production).
TWIN_AGENT_URL=http://localhost:4100
# Shared with apps/agents: signs the 60-second visitor JWT.
TWIN_JWT_SECRET=change-me-32-characters-minimum-000
# Signs the visitor cookie (web only).
TWIN_COOKIE_SECRET=change-me-32-characters-minimum-111
TWIN_DATABASE_URL=postgres://twin:twin@localhost:5433/twin
# Shared with apps/payload and apps/agents: guards GET /api/twin/redact-terms.
TWIN_REDACT_SECRET=change-me-32-characters-minimum-222
# Shared with apps/agents: the system-prompt canary the output filter blocks.
TWIN_PROMPT_CANARY=change-me-canary-16plus
TWIN_DAILY_SPEND_USD=5
```

- [ ] **Step 2: Failing tests**

`apps/web/tests/unit/twin/cookie.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { signVisitorCookie, verifyVisitorCookie } from '@/lib/twin/cookie'

const key = 'c'.repeat(32)
const id = '7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e'

describe('visitor cookie', () => {
  it('round-trips a visitor id', () => {
    expect(verifyVisitorCookie(signVisitorCookie(id, key), key)).toBe(id)
  })

  it('rejects tampering, other keys and non-uuids', () => {
    const v = signVisitorCookie(id, key)
    expect(verifyVisitorCookie(v.replace('7f9c', '7f9d'), key)).toBeNull()
    expect(verifyVisitorCookie(v, 'd'.repeat(32))).toBeNull()
    expect(verifyVisitorCookie(signVisitorCookie('admin', key), key)).toBeNull()
    expect(verifyVisitorCookie(undefined, key)).toBeNull()
  })
})
```

`apps/web/tests/unit/twin/jwt.test.ts`:
```ts
import { jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'
import { mintVisitorJwt, safeTimeZone } from '@/lib/twin/jwt'

const secret = 'j'.repeat(32)

describe('visitor jwt', () => {
  it('mints a 60-second HS256 token the agent channel accepts', async () => {
    const token = await mintVisitorJwt('7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e', 'Europe/Lisbon', secret, 1_000_000)
    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'portfolio-web', audience: 'portfolio-twin', currentDate: new Date(1_000_000 * 1000) })
    expect(protectedHeader.alg).toBe('HS256')
    expect(payload.sub).toBe('7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e')
    expect(payload.tz).toBe('Europe/Lisbon')
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60)
  })

  it('drops invalid time zones rather than forwarding them', () => {
    expect(safeTimeZone('Mars/Base')).toBeUndefined()
    expect(safeTimeZone('America/Sao_Paulo')).toBe('America/Sao_Paulo')
    expect(safeTimeZone(null)).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run.** Command: `bun run --cwd apps/web test -- twin`. Expected: FAIL.

- [ ] **Step 4: Implement.**

`apps/web/lib/twin/env.ts`:
```ts
import 'server-only'
import { parseEnv, webTwinEnvSchema, type WebTwinEnv } from '@repo/twin/env'

let cached: WebTwinEnv | null = null

/** The validated BFF env, parsed on first request (build time has no secrets). */
export function twinEnv(): WebTwinEnv {
  cached ??= parseEnv(webTwinEnvSchema, process.env)
  return cached
}
```

`apps/web/lib/twin/db.ts`:
```ts
import 'server-only'
import { createTwinDb, type TwinDb } from '@repo/twin/db'
import { twinEnv } from './env'

let handle: TwinDb | null = null

/** The process-wide twin database handle for the BFF. */
export function twinDb(): TwinDb {
  handle ??= createTwinDb(twinEnv().TWIN_DATABASE_URL).db
  return handle
}
```

`apps/web/lib/twin/cookie.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Name of the httpOnly cookie that carries the signed visitor id. */
export const VISITOR_COOKIE = 'twin_vid'
/** Cookie lifetime matches retention: a visitor unseen for 90 days is purged anyway. */
export const VISITOR_COOKIE_MAX_AGE = 90 * 24 * 60 * 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const mac = (id: string, key: string) => createHmac('sha256', key).update(`visitor:${id}`).digest('base64url')

/** `<id>.<hmac>`: the id is not secret, the signature stops visitors from impersonating others. */
export function signVisitorCookie(visitorId: string, key: string): string {
  return `${visitorId}.${mac(visitorId, key)}`
}

/** The visitor id in a valid cookie value, or null. */
export function verifyVisitorCookie(value: string | undefined, key: string): string | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  const id = value.slice(0, dot)
  const given = Buffer.from(value.slice(dot + 1))
  const expected = Buffer.from(mac(id, key))
  if (dot < 0 || !UUID.test(id) || given.length !== expected.length) return null
  return timingSafeEqual(given, expected) ? id : null
}
```

`apps/web/lib/twin/jwt.ts`:
```ts
import { SignJWT } from 'jose'
import { isTimeZone } from '@repo/twin/env'

/** A browser-reported IANA zone, or undefined when absent or invalid. */
export function safeTimeZone(value: string | null | undefined): string | undefined {
  return value && value.length <= 64 && isTimeZone(value) ? value : undefined
}

/**
 * The 60-second token the agent's channel verifies (iss portfolio-web, aud portfolio-twin).
 * Minted per proxied request; the browser never sees it.
 */
export async function mintVisitorJwt(visitorId: string, tz: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  return new SignJWT(tz ? { tz } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('portfolio-web')
    .setAudience('portfolio-twin')
    .setSubject(visitorId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 60)
    .sign(new TextEncoder().encode(secret))
}
```

- [ ] **Step 5: Run.** Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/next.config.js apps/web/.env.example apps/web/lib/twin apps/web/tests/unit/twin bun.lock
git commit -m "feat(web): twin bff plumbing: signed visitor cookie and short-lived agent jwt"
```

---

### Task D2: Guardrails: rate limits, caps, spend

**Files:**
- Create: `apps/web/lib/twin/limits.ts`
- Test: `apps/web/tests/unit/twin/limits.test.ts`

- [ ] **Step 1: Failing test**

`apps/web/tests/unit/twin/limits.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConversation, createVisitor, recordSpend, updateConversation } from '@repo/twin/db'
import { createTestDb, type TestDb } from '@repo/twin/testing'
import { TWIN_LIMITS } from '@repo/twin/contract'
import { checkMessage } from '@/lib/twin/limits'

let t: TestDb
let visitorId: string
beforeEach(async () => {
  t = await createTestDb()
  visitorId = await createVisitor(t.db)
  await createConversation(t.db, 's1', visitorId)
})
afterEach(async () => t.close())

const now = new Date('2026-10-04T12:00:00Z')
const base = { ip: '1.2.3.4', sessionId: 's1', dailySpendUsd: 5, now }

describe('checkMessage', () => {
  it('allows a normal message', async () => {
    expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBeNull()
  })

  it('rejects over-long messages before counting them', async () => {
    expect(await checkMessage(t.db, { ...base, text: 'x'.repeat(TWIN_LIMITS.messageMaxChars + 1) })).toBe('too_long')
  })

  it('throttles per session per minute', async () => {
    for (let i = 0; i < TWIN_LIMITS.sessionPerMinute; i++) expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBeNull()
    expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBe('throttled')
  })

  it('ends conversations past the turn cap or flagged ended', async () => {
    await updateConversation(t.db, 's1', (s) => ({ ...s, turnCount: TWIN_LIMITS.maxTurnsPerConversation }))
    expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBe('ended')
  })

  it('goes offline when today’s spend reaches the cap', async () => {
    await recordSpend(t.db, { idempotencyKey: 'k', sessionId: 's1', modelId: 'm', costUsd: 5, inputTokens: 1, outputTokens: 1 })
    expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBe('offline')
  })
})
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/lib/twin/limits.ts`:
```ts
import { TWIN_LIMITS, type TwinRefusal } from '@repo/twin/contract'
import { getConversation, hitRateLimit, spendSince, type TwinDb } from '@repo/twin/db'

/** Why a message is refused, or null to let it through (spec §10). */
export type Refusal = TwinRefusal['kind']

/** Start of the UTC day, the window for the spend cap. */
const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

/**
 * All per-message guardrails in one place, cheapest first. Each hit is durable (Postgres), so
 * limits survive restarts and apply across instances.
 */
export async function checkMessage(
  db: TwinDb,
  m: { ip: string; sessionId: string | null; text: string; dailySpendUsd: number; now: Date },
): Promise<Refusal | null> {
  if (m.text.length > TWIN_LIMITS.messageMaxChars) return 'too_long'
  if (m.sessionId) {
    const conversation = await getConversation(db, m.sessionId)
    if (!conversation || conversation.state.ended || conversation.state.turnCount >= TWIN_LIMITS.maxTurnsPerConversation) return 'ended'
  }
  if ((await spendSince(db, startOfUtcDay(m.now))) >= m.dailySpendUsd) return 'offline'
  const counts = await Promise.all([
    hitRateLimit(db, `ip:${m.ip}:m`, 60, m.now),
    hitRateLimit(db, `ip:${m.ip}:d`, 86_400, m.now),
    m.sessionId ? hitRateLimit(db, `s:${m.sessionId}:m`, 60, m.now) : Promise.resolve(0),
    m.sessionId ? hitRateLimit(db, `s:${m.sessionId}:d`, 86_400, m.now) : Promise.resolve(0),
  ])
  const [ipMin, ipDay, sMin, sDay] = counts
  if ((ipMin ?? 0) > TWIN_LIMITS.ipPerMinute || (ipDay ?? 0) > TWIN_LIMITS.ipPerDay) return 'throttled'
  if ((sMin ?? 0) > TWIN_LIMITS.sessionPerMinute || (sDay ?? 0) > TWIN_LIMITS.sessionPerDay) return 'throttled'
  return null
}
```

- [ ] **Step 4: Run.** Expected: PASS. (pglite runs in the vitest node environment. These test files have no jsdom pragma.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/twin/limits.ts apps/web/tests/unit/twin/limits.test.ts
git commit -m "feat(web): durable twin rate limits, length and turn caps, daily spend cap"
```

---

### Task D3: The proxy route and the output-boundary filter

**Files:**
- Create: `apps/web/lib/twin/filter.ts` (pure NDJSON event rewriting)
- Create: `apps/web/lib/twin/visitor.ts` (cookie → visitor)
- Create: `apps/web/lib/twin/upstream.ts` (calls to the agent)
- Create: `apps/web/app/api/twin/eve/v1/[...path]/route.ts`
- Test: `apps/web/tests/unit/twin/filter.test.ts`, `apps/web/tests/unit/twin/route.test.ts`

- [ ] **Step 1: Verify two eve client facts first** (stop if either is false):
  1. **Completed text replaces the deltas.** In `node_modules/eve/dist/src/client/` (the message reducer), `message.completed` must set the text part's final text to `data.message`, replacing the concatenated deltas. The holdback redactor depends on this, because the held-back tail is delivered in the completed event.
  2. **A `host` with a path prefix works.** `useEveAgent({ host })` builds URLs as `${host}/eve/v1/...`, so `host = ${origin}/api/twin` reaches `/api/twin/eve/v1/...`.

  Record both findings as one-line comments at the top of `filter.ts` and `use-twin.ts`.

- [ ] **Step 2: Failing filter test**

`apps/web/tests/unit/twin/filter.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { LEAK_DEFLECTION } from '@repo/twin/contract'
import { createEventFilter, ndjsonLines } from '@/lib/twin/filter'

const rules = { terms: ['Acme Secret'], allow: [] }
const canary = 'canary-0123456789abcdef'
const ev = (type: string, data: Record<string, unknown>) => ({ type, data, meta: { id: `evt_${type}`, at: 't' } })

describe('createEventFilter', () => {
  it('redacts deltas with holdback and puts the remainder in the completed event', () => {
    const f = createEventFilter(rules, canary)
    const a = f(ev('message.appended', { messageDelta: 'I worked at Acme ', turnId: 't', stepIndex: 0, sequence: 1 }))
    const b = f(ev('message.appended', { messageDelta: 'Secret for years.', turnId: 't', stepIndex: 0, sequence: 2 }))
    const c = f(ev('message.completed', { message: 'I worked at Acme Secret for years.', finishReason: 'stop', turnId: 't', stepIndex: 0, sequence: 3 }))
    const streamed = String(a.data.messageDelta) + String(b.data.messageDelta)
    expect(streamed).not.toContain('Acme Secret')
    expect(c.data.message).toBe('I worked at [redacted] for years.')
  })

  it('replaces a reply containing the canary with the deflection', () => {
    const f = createEventFilter(rules, canary)
    f(ev('message.appended', { messageDelta: `marker ${canary}`, turnId: 't', stepIndex: 0, sequence: 1 }))
    const c = f(ev('message.completed', { message: `marker ${canary}`, finishReason: 'stop', turnId: 't', stepIndex: 0, sequence: 2 }))
    expect(c.data.message).toBe(LEAK_DEFLECTION)
  })

  it('blanks reasoning and non-widget tool payloads but keeps every event', () => {
    const f = createEventFilter(rules, canary)
    expect(f(ev('reasoning.appended', { reasoningDelta: 'secret plan', turnId: 't' })).data.reasoningDelta).toBe('')
    const r = f(ev('action.result', { toolName: 'search_portfolio', callId: 'c', output: { items: [1] } }))
    expect(r.data.output).toBeNull()
    const w = f(ev('action.result', { toolName: 'schedule_call', callId: 'c', output: { status: 'rendered' } }))
    expect(w.data.output).toEqual({ status: 'rendered' })
  })
})

describe('ndjsonLines', () => {
  it('splits across chunk boundaries and passes blank and control lines through', async () => {
    const chunks = ['{"type":"a","data":{},"meta":{"id":"1"}}\n{"ty', 'pe":"b","data":{},"meta":{"id":"2"}}\n\n{"$eve":"stream.lease-ended","version":1}\n']
    const out: string[] = []
    for await (const line of ndjsonLines(new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(new TextEncoder().encode(x)); c.close() } }))) out.push(line)
    expect(out).toEqual(['{"type":"a","data":{},"meta":{"id":"1"}}', '{"type":"b","data":{},"meta":{"id":"2"}}', '', '{"$eve":"stream.lease-ended","version":1}'])
  })
})
```

**Verify the event field names** used here (`reasoningDelta`, and `toolName`/`output` on `action.result`, `actions.requested` and `action.input.appended`) against `node_modules/eve/dist/src/protocol/message.d.ts`. Fix the test **and** the filter to the real field names. The rule stays: blank any tool input or output unless the tool is `schedule_call`, and blank reasoning text.

- [ ] **Step 3: Run.** Expected: FAIL.

- [ ] **Step 4: Implement the filter.**

`apps/web/lib/twin/filter.ts`:
```ts
import { LEAK_DEFLECTION } from '@repo/twin/contract'
import { redactText, StreamRedactor, type RedactionRules } from '@repo/twin/redact'

/** One eve stream event (NDJSON line). Only `data` content is ever rewritten. */
export interface StreamEvent {
  type: string
  data: Record<string, unknown>
  meta: Record<string, unknown>
}

/** Only the booking dialog's payload reaches the browser; other tool I/O is the agent's business. */
const VISIBLE_TOOLS = new Set(['schedule_call'])
const TOOL_EVENTS = new Set(['actions.requested', 'action.input.appended', 'action.partial', 'action.result'])

/**
 * The output boundary (spec §10). Redacts never-tier terms, PII and the prompt canary from
 * assistant text, independent of what the model produced, and blanks reasoning and tool payloads.
 * Never drops or adds events: clients resume by absolute event index.
 */
export function createEventFilter(rules: RedactionRules, canary: string): (e: StreamEvent) => StreamEvent {
  const withCanary: RedactionRules = { terms: [...rules.terms, canary], allow: rules.allow }
  const redactors = new Map<string, StreamRedactor>()
  const keyOf = (d: Record<string, unknown>) => `${String(d.turnId)}:${String(d.stepIndex)}`

  return (e) => {
    const d = e.data
    if (e.type === 'message.appended' && typeof d.messageDelta === 'string') {
      const key = keyOf(d)
      const r = redactors.get(key) ?? new StreamRedactor(withCanary)
      redactors.set(key, r)
      return { ...e, data: { ...d, messageDelta: r.push(d.messageDelta) } }
    }
    if (e.type === 'message.completed' && typeof d.message === 'string') {
      redactors.delete(keyOf(d))
      const leaked = d.message.includes(canary)
      if (leaked) console.warn(`[twin] canary leak blocked in turn ${String(d.turnId)}`)
      return { ...e, data: { ...d, message: leaked ? LEAK_DEFLECTION : redactText(d.message, withCanary) } }
    }
    if (e.type.startsWith('reasoning.')) {
      return { ...e, data: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' && k !== 'turnId' ? '' : v])) }
    }
    if (TOOL_EVENTS.has(e.type) && !VISIBLE_TOOLS.has(String(d.toolName))) {
      return { ...e, data: { ...d, input: null, output: null, inputDelta: d.inputDelta === undefined ? undefined : '' } }
    }
    return e
  }
}

/** Splits a byte stream into NDJSON lines (including blank and `$eve` control lines). */
export async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let nl = buffer.indexOf('\n')
    while (nl >= 0) {
      yield buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf('\n')
    }
  }
  if (buffer.length > 0) yield buffer
}

/** Applies the filter to an NDJSON body, line by line, preserving control lines and order. */
export function filterStream(body: ReadableStream<Uint8Array>, filter: (e: StreamEvent) => StreamEvent): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const lines = ndjsonLines(body)
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await lines.next()
      if (done) return controller.close()
      if (value.trim() === '' || value.startsWith('{"$eve"')) return controller.enqueue(encoder.encode(`${value}\n`))
      controller.enqueue(encoder.encode(`${JSON.stringify(filter(JSON.parse(value) as StreamEvent))}\n`))
    },
    async cancel() {
      await lines.return(undefined)
    },
  })
}
```

Two refinements. First, the `inputDelta` line must not add a key that wasn't there: build the replaced object so that keys absent from `d` stay absent. Second, strings inside `input`/`output` are replaced wholesale by `null`. Adjust the code until the tests pass.

- [ ] **Step 5: Visitor and upstream helpers.**

`apps/web/lib/twin/visitor.ts`:
```ts
import 'server-only'
import { createVisitor, touchVisitor, visitorExists } from '@repo/twin/db'
import { cookies } from 'next/headers'
import { signVisitorCookie, verifyVisitorCookie, VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE } from './cookie'
import { twinDb } from './db'
import { twinEnv } from './env'

/** The visitor behind this request, creating one (and its cookie) on first contact. */
export async function currentVisitor(): Promise<string> {
  const jar = await cookies()
  const key = twinEnv().TWIN_COOKIE_SECRET
  const known = verifyVisitorCookie(jar.get(VISITOR_COOKIE)?.value, key)
  const id = known && (await visitorExists(twinDb(), known)) ? known : await createVisitor(twinDb())
  if (id !== known) {
    jar.set(VISITOR_COOKIE, signVisitorCookie(id, key), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: VISITOR_COOKIE_MAX_AGE })
  }
  await touchVisitor(twinDb(), id)
  return id
}

/** The visitor id from the cookie without creating one (deletion endpoint). */
export async function existingVisitor(): Promise<string | null> {
  const jar = await cookies()
  return verifyVisitorCookie(jar.get(VISITOR_COOKIE)?.value, twinEnv().TWIN_COOKIE_SECRET)
}

/** Client IP as set by the reverse proxy (Easypanel/Traefik sets X-Forwarded-For). */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
```

Read the Next 16.3 docs for `cookies()` in route handlers (whether it is async and settable). Adapt if the API differs.

`apps/web/lib/twin/upstream.ts`:
```ts
import 'server-only'
import { twinEnv } from './env'
import { mintVisitorJwt, safeTimeZone } from './jwt'

/** Calls the agent's eve routes as this visitor. The agent is only reachable from the server. */
export async function agentFetch(path: string, visitorId: string, init: { method: 'GET' | 'POST'; body?: unknown; tz?: string | null; search?: string; signal?: AbortSignal }): Promise<Response> {
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
```

- [ ] **Step 6: The route.**

`apps/web/app/api/twin/eve/v1/[...path]/route.ts`:
```ts
import { REFUSAL_STATUS, TwinRefusal } from '@repo/twin/contract'
import { createConversation, ownsSession } from '@repo/twin/db'
import { fetchRedactionRules } from '@repo/twin/redact'
import { z } from 'zod'
import { twinDb } from '@/lib/twin/db'
import { twinEnv } from '@/lib/twin/env'
import { createEventFilter, filterStream } from '@/lib/twin/filter'
import { checkMessage, type Refusal } from '@/lib/twin/limits'
import { agentFetch } from '@/lib/twin/upstream'
import { clientIp, currentVisitor } from '@/lib/twin/visitor'

export const dynamic = 'force-dynamic'

const MessageBody = z.object({ message: z.string().min(1), clientContext: z.unknown().optional() }).strict()
const CreateBody = z.object({ message: z.string().min(1).optional(), clientContext: z.unknown().optional() }).strict()
const SESSION = /^[\w-]{1,128}$/

const refuse = (kind: Refusal) => Response.json(TwinRefusal.parse({ ok: false, kind }), { status: REFUSAL_STATUS[kind] })
const notFound = () => Response.json({ ok: false }, { status: 404 })

/** Proxies upstream JSON responses as-is (status and body). */
const relay = async (r: Response) => new Response(await r.text(), { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json', ...(r.headers.get('x-eve-session-id') ? { 'x-eve-session-id': r.headers.get('x-eve-session-id') ?? '' } : {}) } })

/** POST /api/twin/eve/v1/session and /session/:id: the only writes a visitor can make. */
export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const env = twinEnv()
  const visitorId = await currentVisitor()
  const tz = request.headers.get('x-twin-tz')
  const ip = clientIp(request)

  if (path.length === 1 && path[0] === 'session') {
    const body = CreateBody.parse(await request.json().catch(() => ({})))
    const refusal = body.message ? await checkMessage(twinDb(), { ip, sessionId: null, text: body.message, dailySpendUsd: env.TWIN_DAILY_SPEND_USD, now: new Date() }) : null
    if (refusal) return refuse(refusal)
    // Create without a message first, so the ownership row exists before any turn runs.
    const created = await agentFetch('session', visitorId, { method: 'POST', body: {}, tz })
    if (!created.ok) return relay(created)
    const { sessionId } = z.object({ sessionId: z.string().regex(SESSION) }).parse(await created.clone().json())
    await createConversation(twinDb(), sessionId, visitorId)
    if (!body.message) return relay(created)
    return relay(await agentFetch(`session/${sessionId}`, visitorId, { method: 'POST', body, tz }))
  }

  if (path.length === 2 && path[0] === 'session' && SESSION.test(path[1] ?? '')) {
    const sessionId = path[1] as string
    if (!(await ownsSession(twinDb(), sessionId, visitorId))) return notFound()
    const parsed = MessageBody.safeParse(await request.json().catch(() => null))
    // Visitors can only send messages: input responses (approvals, limits) are never theirs to give.
    if (!parsed.success) return Response.json({ ok: false }, { status: 400 })
    const refusal = await checkMessage(twinDb(), { ip, sessionId, text: parsed.data.message, dailySpendUsd: env.TWIN_DAILY_SPEND_USD, now: new Date() })
    if (refusal) return refuse(refusal)
    return relay(await agentFetch(`session/${sessionId}`, visitorId, { method: 'POST', body: parsed.data, tz }))
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
  const upstream = await agentFetch(`session/${sessionId}/stream`, visitorId, { method: 'GET', search: new URL(request.url).search, signal: request.signal })
  if (!upstream.ok || !upstream.body) return relay(upstream)
  const rules = await fetchRedactionRules(env.CMS_URL, env.TWIN_REDACT_SECRET)
  const headers = new Headers({ 'content-type': upstream.headers.get('content-type') ?? 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' })
  for (const h of ['x-eve-session-id', 'x-eve-stream-format', 'x-eve-stream-version', 'x-eve-stream-tail-index']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new Response(filterStream(upstream.body, createEventFilter(rules, env.TWIN_PROMPT_CANARY)), { status: upstream.status, headers })
}
```

`MessageBody.strict()` rejects `inputResponses`, `turnPolicy` and anything else. If the eve client sends extra fields on a normal send (for example `turnPolicy` or `outputSchema`), list them explicitly in `MessageBody` after checking `SendTurnPayload` in `eve/dist`. Never relax to `.passthrough()`.

- [ ] **Step 7: Route test** (agent and CMS mocked with `vi.stubGlobal('fetch')`, the db on pglite)

`apps/web/tests/unit/twin/route.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '@repo/twin/testing'

let t: TestDb
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: (n: string, v: string) => void jar.set(n, v) }),
}))
vi.mock('@/lib/twin/db', () => ({ twinDb: () => t.db }))

beforeEach(async () => {
  t = await createTestDb()
  jar.clear()
  vi.stubEnv('TWIN_AGENT_URL', 'http://agent')
  vi.stubEnv('TWIN_JWT_SECRET', 'j'.repeat(32))
  vi.stubEnv('TWIN_COOKIE_SECRET', 'c'.repeat(32))
  vi.stubEnv('TWIN_DATABASE_URL', 'postgres://unused/x')
  vi.stubEnv('TWIN_REDACT_SECRET', 'r'.repeat(32))
  vi.stubEnv('TWIN_PROMPT_CANARY', 'canary-0123456789abcdef')
  vi.stubEnv('CMS_URL', 'http://cms')
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await t.close()
})

const params = (...path: string[]) => ({ params: Promise.resolve({ path }) })

describe('twin proxy', () => {
  it('creates a session, records ownership, then forwards the first message', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      return url.endsWith('/eve/v1/session')
        ? Response.json({ ok: true, sessionId: 'wrun_1', status: 'accepted' }, { status: 202 })
        : Response.json({ ok: true, sessionId: 'wrun_1', status: 'accepted', deliveryId: 'd' }, { status: 202 })
    }))
    const { POST } = await import('@/app/api/twin/eve/v1/[...path]/route')
    const res = await POST(new Request('http://web/api/twin/eve/v1/session', { method: 'POST', body: JSON.stringify({ message: 'hi' }) }), params('session'))
    expect(res.status).toBe(202)
    expect(calls).toEqual(['http://agent/eve/v1/session', 'http://agent/eve/v1/session/wrun_1'])
  })

  it('hides sessions the visitor does not own and refuses input responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })))
    const { POST } = await import('@/app/api/twin/eve/v1/[...path]/route')
    const other = await POST(new Request('http://web/x', { method: 'POST', body: JSON.stringify({ message: 'hi' }) }), params('session', 'someone-else'))
    expect(other.status).toBe(404)
  })
})
```

Add a third case of your own once the first two pass: a visitor who owns `wrun_1` POSTs `{ inputResponses: [...] }` and gets 400. Build that ownership through the create flow from the first case.

- [ ] **Step 8: Run.** Command: `bun run --cwd apps/web test -- twin && bun run --cwd apps/web check-types`. Expected: PASS. `check-types` will still fail on `contact.replies`, which is fixed in D5. If so, only confirm that the new files are free of errors (`tsc --noEmit` output limited to `messenger`/`mappers`).

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/twin/filter.ts apps/web/lib/twin/visitor.ts apps/web/lib/twin/upstream.ts "apps/web/app/api/twin/eve/v1/[...path]/route.ts" apps/web/tests/unit/twin/filter.test.ts apps/web/tests/unit/twin/route.test.ts
git commit -m "feat(web): twin bff proxy with session ownership, guardrails and an output-boundary filter"
```

---

### Task D4: Webhook forwarders and the deletion endpoint

**Files:**
- Create: `apps/web/app/api/twin/hooks/[provider]/route.ts`
- Create: `apps/web/app/api/twin/me/route.ts`
- Test: `apps/web/tests/unit/twin/hooks-route.test.ts`

- [ ] **Step 1: Failing test**

`apps/web/tests/unit/twin/hooks-route.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('webhook forwarder', () => {
  it('forwards the raw body and only the signature headers to the agent', async () => {
    vi.stubEnv('TWIN_AGENT_URL', 'http://agent')
    const seen: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response('ok')
    }))
    const { POST } = await import('@/app/api/twin/hooks/[provider]/route')
    const body = '{"triggerEvent":"BOOKING_CREATED"}'
    const res = await POST(new Request('http://web/api/twin/hooks/cal', { method: 'POST', body, headers: { 'x-cal-signature-256': 'abc', cookie: 'x=y' } }), { params: Promise.resolve({ provider: 'cal' }) })
    expect(res.status).toBe(200)
    expect(seen[0]?.url).toBe('http://agent/webhooks/cal')
    expect(seen[0]?.init.body).toBe(body)
    expect(new Headers(seen[0]?.init.headers).get('cookie')).toBeNull()
    expect(new Headers(seen[0]?.init.headers).get('x-cal-signature-256')).toBe('abc')
  })

  it('404s unknown providers without calling the agent', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { POST } = await import('@/app/api/twin/hooks/[provider]/route')
    const res = await POST(new Request('http://web/x', { method: 'POST', body: '' }), { params: Promise.resolve({ provider: 'github' }) })
    expect(res.status).toBe(404)
  })
})
```

The forwarder needs only `TWIN_AGENT_URL`. It reads `process.env.TWIN_AGENT_URL` through a narrow `z.url()` parse rather than the full `twinEnv()`, so a webhook delivery doesn't depend on unrelated BFF secrets. Make that choice explicit in a comment.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

`apps/web/app/api/twin/hooks/[provider]/route.ts`:
```ts
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
 * Only TWIN_AGENT_URL is read, so delivery never depends on unrelated BFF secrets.
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
```

`apps/web/app/api/twin/me/route.ts`:
```ts
import { deleteVisitor, listVisitorSessions } from '@repo/twin/db'
import { cookies } from 'next/headers'
import { VISITOR_COOKIE } from '@/lib/twin/cookie'
import { twinDb } from '@/lib/twin/db'
import { agentFetch } from '@/lib/twin/upstream'
import { existingVisitor } from '@/lib/twin/visitor'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/twin/me: erase this visitor (spec §8). Retires their eve sessions (run data goes
 * with retention 0), deletes every row they own, and forgets the cookie.
 */
export async function DELETE() {
  const visitorId = await existingVisitor()
  if (!visitorId) return new Response(null, { status: 204 })
  for (const sessionId of await listVisitorSessions(twinDb(), visitorId)) {
    const res = await agentFetch(`session/${sessionId}/reset`, visitorId, { method: 'POST', body: { reason: 'visitor deletion request' } })
    if (!res.ok && res.status !== 404 && res.status !== 409) throw new Error(`reset ${sessionId} failed with ${res.status}`)
  }
  await deleteVisitor(twinDb(), visitorId)
  ;(await cookies()).delete(VISITOR_COOKIE)
  return new Response(null, { status: 204 })
}
```

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/twin/hooks/[provider]/route.ts" apps/web/app/api/twin/me/route.ts apps/web/tests/unit/twin/hooks-route.test.ts
git commit -m "feat(web): webhook forwarders to the private agent and a visitor data deletion endpoint"
```

---

### Task D5: CMS types and mapper, message parts, and the `useTwin` hook

**Files:**
- Modify: `apps/web/lib/cms/types.ts` (`MessengerContact` loses `replies`; `MessengerLabels` gains the new labels)
- Modify: `apps/web/lib/cms/mappers.ts` (`toMessenger`)
- Modify: `apps/web/tests/unit/cms/mappers.test.ts` (fixtures)
- Create: `apps/web/features/os/apps/messenger/parts.ts` (pure: eve messages → lines)
- Create: `apps/web/features/os/apps/messenger/use-twin.ts`
- Delete: `apps/web/features/os/apps/messenger/responder.ts`, `use-conversation.ts`, and their tests `tests/unit/os/messenger/responder.test.ts`, `use-conversation.test.ts`
- Test: `apps/web/tests/unit/os/messenger/parts.test.ts`

- [ ] **Step 1: Types and mapper.**
  - In `types.ts`, remove `replies` from `MessengerContact`. If that leaves `MessengerContact` identical to `MessengerPerson`, delete `MessengerContact`, use `MessengerPerson` everywhere, and update the references.
  - Add these to `MessengerLabels`, each with a one-line JSDoc: `throttled`, `tooLong`, `ended`, `offline`, `privacy`, `deleteData`, `bookingTitle`, `yourTime`, `myTime`, and `bookingNotice` (whose JSDoc notes that `{time}` is replaced).
  - In `toMessenger`, set `contact: toPerson(m.contact, base)`.
  - Update the fixtures in `tests/unit/cms/mappers.test.ts` (drop `replies`, add the labels).

- [ ] **Step 2: Failing parts test**

`apps/web/tests/unit/os/messenger/parts.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { encodeNotice } from '@repo/twin/contract'
import { toLines } from '@/features/os/apps/messenger/parts'

const rendered = { status: 'rendered', calOrigin: 'https://cal.com', embedScriptUrl: 'https://app.cal.com/embed/embed.js', calLink: 'v/intro', bookingRef: 'r.s', ownerTimeZone: 'America/Sao_Paulo', visitorTimeZone: 'Europe/Lisbon' }

describe('toLines', () => {
  it('maps visitor text, twin text, the booking dialog and system notices', () => {
    const lines = toLines([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hey!' }, { type: 'dynamic-tool', toolName: 'schedule_call', toolCallId: 'c', state: 'output-available', input: {}, output: rendered }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: encodeNotice({ kind: 'booking.confirmed', startTime: '2026-10-08T14:00:00Z' }) }] },
    ])
    expect(lines.map((l) => l.kind)).toEqual(['text', 'text', 'booking', 'notice'])
    expect(lines[0]).toMatchObject({ from: 'viewer', text: 'hi' })
    expect(lines[1]).toMatchObject({ from: 'contact', text: 'hey!' })
  })

  it('ignores other tools, refused widgets and empty text', () => {
    const lines = toLines([{ id: 'a', role: 'assistant', parts: [{ type: 'text', text: '' }, { type: 'dynamic-tool', toolName: 'schedule_call', toolCallId: 'c', state: 'output-available', input: {}, output: { status: 'refused', reason: 'not_hot' } }, { type: 'dynamic-tool', toolName: 'search_portfolio', toolCallId: 'd', state: 'output-available', input: {}, output: null }] }])
    expect(lines).toEqual([])
  })
})
```

- [ ] **Step 3: Run.** Expected: FAIL.

- [ ] **Step 4: Implement.**

`apps/web/features/os/apps/messenger/parts.ts`:
```ts
import { parseNotice, ScheduleCallRendered, type TwinNotice } from '@repo/twin/contract'

/** One rendered item of the conversation history. */
export type Line =
  | { kind: 'text'; id: string; from: 'viewer' | 'contact'; text: string }
  | { kind: 'booking'; id: string; booking: ScheduleCallRendered }
  | { kind: 'notice'; id: string; notice: TwinNotice }

/** The parts of eve messages this window reads (a structural subset of `EveMessage`). */
export interface MessageLike {
  id: string
  role: 'user' | 'assistant'
  parts: ReadonlyArray<{ type: string; text?: string; toolName?: string; state?: string; output?: unknown; toolCallId?: string }>
}

/**
 * Flattens eve messages into the window's lines: visitor and twin text, the booking dialog
 * (the only tool with a visible result), and booking notices rendered as system lines.
 */
export function toLines(messages: readonly MessageLike[]): Line[] {
  const lines: Line[] = []
  for (const m of messages) {
    m.parts.forEach((p, i) => {
      const id = `${m.id}:${i}`
      if (p.type === 'text' && p.text) {
        const notice = m.role === 'user' ? parseNotice(p.text) : null
        if (notice) lines.push({ kind: 'notice', id, notice })
        else lines.push({ kind: 'text', id, from: m.role === 'user' ? 'viewer' : 'contact', text: p.text })
      }
      if (p.type === 'dynamic-tool' && p.toolName === 'schedule_call' && p.state === 'output-available') {
        const booking = ScheduleCallRendered.safeParse(p.output)
        if (booking.success) lines.push({ kind: 'booking', id, booking: booking.data })
      }
    })
  }
  return lines
}
```

(`safeParse` is allowed here because the spec defines the fallback: a refused or absent descriptor renders nothing.)

`apps/web/features/os/apps/messenger/use-twin.ts`:
```ts
'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEveAgent } from 'eve/react'
import { REFUSAL_STATUS, type TwinRefusal } from '@repo/twin/contract'
import { toLines, type Line, type MessageLike } from './parts'

const SESSION_KEY = 'twin-session'

type Refusal = TwinRefusal['kind']

/** Reads the saved session; storage can be unavailable (private mode), which just means no resume. */
function savedSession(): { sessionId: string; streamIndex: number } | undefined {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as { sessionId: string; streamIndex: number }) : undefined
  } catch {
    return undefined
  }
}

/** Maps a failed send's HTTP status to the refusal the window explains in character. */
function refusalOf(error: unknown): Refusal {
  const status = (error as { status?: number }).status
  const entry = Object.entries(REFUSAL_STATUS).find(([, s]) => s === status)
  return (entry?.[0] as Refusal | undefined) ?? 'offline'
}

/**
 * The live conversation with the twin through the BFF (`/api/twin`). Persists the session so a
 * reload or dropped connection resumes the same stream from where it stopped.
 */
export function useTwin() {
  const [initial] = useState(savedSession)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const agent = useEveAgent({
    host: `${window.location.origin}/api/twin`,
    headers: () => ({ 'x-twin-tz': Intl.DateTimeFormat().resolvedOptions().timeZone }),
    initialSession: initial,
    resume: initial !== undefined,
    onSessionChange: (s) => {
      try {
        if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s))
        else window.localStorage.removeItem(SESSION_KEY)
      } catch {
        // Storage unavailable: the conversation still works, it just won't resume after reload.
      }
    },
  })
  const lines: Line[] = useMemo(() => toLines(agent.data.messages as readonly MessageLike[]), [agent.data.messages])
  const typing = agent.status === 'submitted' || agent.status === 'streaming'

  const send = useCallback(
    async (text: string) => {
      setRefusal(null)
      try {
        await agent.send(text)
      } catch (error) {
        setRefusal(refusalOf(error))
      }
    },
    [agent],
  )

  useEffect(() => {
    if (agent.error) setRefusal(refusalOf(agent.error))
  }, [agent.error])

  return { lines, typing, refusal, send, reset: agent.reset }
}
```

Verify in `eve/dist/src/react/use-eve-agent.d.ts` and the client error class:
- that `headers` accepts a function
- that a failed send rejects with an error exposing the HTTP `status` (for example `ClientError.status`)
- that `reset` exists

If the status is exposed under another name, read it from there. Never parse message strings. `window` is only touched inside the client hook, and `Conversation` is a client component inside the OS desktop, which is client-rendered.

- [ ] **Step 5: Run.** Command: `bun run --cwd apps/web test`. Expected: the parts test passes. Delete the obsolete files listed above, plus `tests/unit/os/messenger/responder.test.ts` and `use-conversation.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/cms/types.ts apps/web/lib/cms/mappers.ts apps/web/tests/unit/cms/mappers.test.ts apps/web/features/os/apps/messenger/parts.ts apps/web/features/os/apps/messenger/use-twin.ts apps/web/tests/unit/os/messenger/parts.test.ts
git rm apps/web/features/os/apps/messenger/responder.ts apps/web/features/os/apps/messenger/use-conversation.ts apps/web/tests/unit/os/messenger/responder.test.ts apps/web/tests/unit/os/messenger/use-conversation.test.ts
git commit -m "feat(os): messenger conversation driven by the twin agent through eve/react"
```

---

### Task D6: History lines, the MSN booking dialog, the Conversation window

**Files:**
- Modify: `apps/web/features/os/apps/messenger/History.tsx`
- Create: `apps/web/features/os/apps/messenger/BookingDialog.tsx`, `apps/web/features/os/apps/messenger/cal-embed.ts`
- Modify: `apps/web/features/os/apps/messenger/Conversation.tsx`
- Modify: `apps/web/features/os/apps/messenger/messenger.module.css` (append the classes below)
- Modify: `apps/web/tests/unit/os/messenger/history.test.ts`
- Test: `apps/web/tests/unit/os/messenger/cal-embed.test.ts`

- [ ] **Step 1: Failing tests.**

Update `history.test.ts`. `groupBySender` now groups `Line`s:
- Consecutive `text` lines from one sender share a group.
- A `booking` line joins the contact's group.
- A `notice` line is its own ungrouped item.

Write these three cases with `createElement`/`createRoot`, following the file's existing pattern.

`apps/web/tests/unit/os/messenger/cal-embed.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { embedConfig, formatZoneTime } from '@/features/os/apps/messenger/cal-embed'

describe('cal embed', () => {
  it('passes the signed booking ref as metadata and prefills the name', () => {
    expect(embedConfig({ bookingRef: 'r.s', prefillName: 'Ana' })).toEqual({ layout: 'month_view', theme: 'light', 'metadata[bookingRef]': 'r.s', name: 'Ana' })
    expect(embedConfig({ bookingRef: 'r.s' })).toEqual({ layout: 'month_view', theme: 'light', 'metadata[bookingRef]': 'r.s' })
  })

  it('formats a time in a zone for the dialog header', () => {
    expect(formatZoneTime(new Date('2026-10-08T14:00:00Z'), 'America/Sao_Paulo')).toMatch(/11:00/)
  })
})
```

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.**

`apps/web/features/os/apps/messenger/cal-embed.ts`:
```ts
'use client'

/** The slice of Cal.com's documented embed API this window calls (cal.com docs: embed). */
interface CalApi {
  (method: 'init', namespace: string, options: { origin: string }): void
  ns: Record<string, (method: string, options: Record<string, unknown>) => void>
  loaded?: boolean
}

declare global {
  interface Window {
    Cal?: CalApi
  }
}

/** Inline-embed config: the signed booking ref returns through the webhook as metadata. */
export function embedConfig(o: { bookingRef: string; prefillName?: string }): Record<string, string> {
  return { layout: 'month_view', theme: 'light', 'metadata[bookingRef]': o.bookingRef, ...(o.prefillName ? { name: o.prefillName } : {}) }
}

/** "11:00" style time in a zone, for the two-zone header. */
export function formatZoneTime(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
}

/**
 * Loads Cal.com's embed.js exactly as the official snippet does, once per page, and returns the
 * global `Cal` queue (calls made before the script finishes are queued by the snippet).
 */
export function loadCal(scriptUrl: string): CalApi {
  if (window.Cal) return window.Cal
  // The official loader snippet (cal.com docs → Embed → install), kept verbatim in behaviour.
  ;(function (C: Window & typeof globalThis, A: string, L: string) {
    const p = (a: { q: unknown[] }, ar: unknown) => {
      a.q.push(ar)
    }
    const d = C.document
    const cal = function (...args: unknown[]) {
      const self = C.Cal as unknown as { loaded?: boolean; ns: Record<string, unknown>; q: unknown[] }
      if (!self.loaded) {
        self.ns = {}
        self.q = self.q || []
        const s = d.createElement('script')
        s.src = A
        s.async = true
        d.head.appendChild(s)
        self.loaded = true
      }
      if (args[0] === L) {
        const api = function (...a: unknown[]) {
          p(api as unknown as { q: unknown[] }, a)
        } as unknown as { q: unknown[] }
        const namespace = args[1]
        api.q = api.q || []
        if (typeof namespace === 'string') {
          self.ns[namespace] = self.ns[namespace] || api
          p(self.ns[namespace] as { q: unknown[] }, args)
          p(self, ['initNamespace', namespace])
        } else p(self, args)
        return
      }
      p(self, args)
    }
    C.Cal = cal as unknown as CalApi
  })(window, scriptUrl, 'init')
  return window.Cal as CalApi
}
```

Cross-check `loadCal` against the snippet Cal.com's embed generator currently produces (cal.com docs: Embed → "Inline"). It must keep the queueing behaviour of the official snippet. If the official snippet differs, mirror it, and keep the typed wrapper.

`apps/web/features/os/apps/messenger/BookingDialog.tsx`:
```tsx
'use client'
import { useEffect, useId, useState } from 'react'
import type { ScheduleCallRendered } from '@repo/twin/contract'
import type { MessengerLabels } from '@/lib/cms/types'
import { embedConfig, formatZoneTime, loadCal } from './cal-embed'
import styles from './messenger.module.css'

/** The Cal.com booker inside an MSN-era dialog: title bar, bevelled frame, both time zones. */
export function BookingDialog({ booking, labels }: { booking: ScheduleCallRendered; labels: MessengerLabels }) {
  const ns = `twin${useId().replace(/[^a-z0-9]/gi, '')}`
  const [now] = useState(() => new Date())
  const visitorZone = booking.visitorTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  useEffect(() => {
    const cal = loadCal(booking.embedScriptUrl)
    cal('init', ns, { origin: booking.calOrigin })
    cal.ns[ns]?.('inline', { elementOrSelector: `#${ns}`, calLink: booking.calLink, config: embedConfig({ bookingRef: booking.bookingRef, prefillName: booking.prefillName }) })
    cal.ns[ns]?.('ui', { hideEventTypeDetails: false, layout: 'month_view' })
  }, [ns, booking])

  return (
    <section className={styles.dialog} aria-label={labels.bookingTitle}>
      <header className={styles.dialogTitle}>{labels.bookingTitle}</header>
      <p className={styles.dialogZones}>
        {labels.yourTime}: {formatZoneTime(now, visitorZone)} ({visitorZone}) · {labels.myTime}: {formatZoneTime(now, booking.ownerTimeZone)} ({booking.ownerTimeZone})
      </p>
      <div id={ns} className={styles.dialogBody} />
    </section>
  )
}
```

Append to `messenger.module.css`, reusing the existing `--msn-*` tokens and the bevel look from `features/os/bevel.module.css`. Read both before writing, and do not hard-code colours the tokens already define:
```css
/* The booking dialog: a Windows-era dialog inside the chat (title bar, raised bevel, system font). */
.dialog {
  margin: 6px 0;
  border: 2px outset var(--os-face, #d4d0c8);
  background: var(--os-face, #d4d0c8);
  font: 12px/1.3 var(--msn-font);
}
.dialogTitle {
  padding: 3px 6px;
  color: #fff;
  font-weight: 700;
  background: linear-gradient(90deg, var(--os-title, #0a246a), var(--os-title-end, #a6caf0));
}
.dialogZones {
  margin: 4px 6px;
}
.dialogBody {
  min-height: 420px;
  margin: 0 6px 6px;
  border: 2px inset var(--os-face, #d4d0c8);
  background: #fff;
  overflow: auto;
}
.notice {
  color: var(--msn-muted, #666);
  font-style: italic;
  list-style: none;
}
.refusal {
  color: var(--msn-muted, #666);
  font-style: italic;
}
.privacy {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 2px 4px;
  font-size: 11px;
}
.privacy button {
  border: 0;
  padding: 0;
  color: inherit;
  text-decoration: underline;
  background: none;
  cursor: pointer;
}
```

Replace the variable fallbacks with the actual token names found in `os-tokens.css` and `messenger.module.css`. Each `var()` must reference a token that exists, with no fallback when the token is defined.

`History.tsx`:
- Change the props to `{ lines: readonly Line[]; nameOf: (from: 'viewer' | 'contact') => string; renderBooking: (b: ScheduleCallRendered) => ReactNode; noticeText: (n: TwinNotice) => string }`.
- `groupBySender` groups lines as described in Step 1. A text line renders as before. A booking line renders `renderBooking(...)` inside the contact's `.lines`. A notice renders as `<li className={styles.notice}>{noticeText(n)}</li>`.
- Keep the auto-scroll, now keyed on `lines`.

`Conversation.tsx`:
- Replace `scriptedResponder`/`useConversation` with `const { lines, typing, refusal, send, reset } = useTwin()`.
- `submit` calls `void send(draft)`.
- Pass `renderBooking={(b) => <BookingDialog booking={b} labels={labels} />}`.
- `noticeText` returns `n.kind === 'booking.confirmed' || n.kind === 'booking.rescheduled' ? labels.bookingNotice.replace('{time}', n.startTime ? new Date(n.startTime).toLocaleString() : '') : ''`. A cancelled notice renders nothing; filter it out in `History` by returning `''` and skipping empty notices.
- Under the typing line, render the refusal: `{refusal ? <p className={styles.refusal} role="status">{labels[refusalLabel[refusal]]}</p> : null}`, with `const refusalLabel = { throttled: 'throttled', too_long: 'tooLong', ended: 'ended', offline: 'offline' } as const`.
- After the compose form, add the footer:
```tsx
<footer className={styles.privacy}>
  <span>{labels.privacy}</span>
  <button type="button" onClick={async () => { await fetch('/api/twin/me', { method: 'DELETE' }); reset() }}>{labels.deleteData}</button>
</footer>
```

- [ ] **Step 4: Run.** Command: `bun run --cwd apps/web test && bun run --cwd apps/web check-types && bun run --cwd apps/web lint`. Expected: all green. `check-types` is now clean because `replies` is gone everywhere.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/os/apps/messenger apps/web/tests/unit/os/messenger
git commit -m "feat(os): msn-style booking dialog, booking notices, refusals and privacy footer in the conversation"
```

---

### Task D7: End-to-end test with the agent mocked at the BFF, and the Phase D gate

**Files:**
- Modify: `apps/web/tests/e2e/os.spec.ts` (the Messenger section, lines ~136–190)
- Create: `apps/web/tests/e2e/fixtures/twin-stream.ndjson`

- [ ] **Step 1: Fixture.** Write a minimal NDJSON stream:
  1. `session.started`
  2. `turn.started`
  3. `message.appended` ×2: "Hey! I'm around." and " What are you working on?"
  4. `message.completed` with the full text
  5. `actions.requested` and `action.result` for `schedule_call` with a `rendered` descriptor; `calOrigin` and `embedScriptUrl` point to `http://127.0.0.1:1/` so nothing external loads
  6. `turn.completed`
  7. `session.waiting`

  Use the exact event shapes from `eve/dist/src/protocol/message.d.ts`.

- [ ] **Step 2: Test.** Replace the scripted-reply assertions in `os.spec.ts` with route interception:
  - `page.route('**/api/twin/eve/v1/session', ...)` → 202 `{ ok: true, sessionId: 'wrun_e2e', status: 'accepted' }`
  - `page.route('**/api/twin/eve/v1/session/wrun_e2e', ...)` → 202
  - `page.route('**/api/twin/eve/v1/session/wrun_e2e/stream*', ...)` → the fixture, with `content-type: application/x-ndjson`

  Assert three things:
  - After sending "hi", the history shows the contact's two-sentence reply.
  - The booking dialog (`getByRole('region', { name: <bookingTitle label> })`) is visible.
  - The privacy footer text is visible.

  Keep `collectErrors` and assert there are no console errors. Block the Cal.com script request with `page.route('http://127.0.0.1:1/**', r => r.abort())` and allow that one expected network error in the assertion.

- [ ] **Step 3: Run.** Command: `bun run --cwd apps/web test:e2e -- os.spec.ts`. The CMS must be running on :3001; see `playwright.config.ts`. Expected: PASS.

- [ ] **Step 4: Phase D gate.** Run `bun run --cwd apps/web test && bun run --cwd apps/web check-types && bun run --cwd apps/web lint`. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/os.spec.ts apps/web/tests/e2e/fixtures/twin-stream.ndjson
git commit -m "test(os): conversation e2e against a mocked twin stream"
```
