# Phase A — Foundation (`packages/twin`)

Part of `2026-10-04-portfolio-twin-agent.md`. Read its "Global conventions" first.

`@repo/twin` is the only code shared by `apps/agents` and `apps/web`. It exports TypeScript source, as `@repo/cms-types` does. Consumers compile it: eve's bundler for agents, `transpilePackages` for Next.

---

### Task A1: Workspace scaffolding, formatting, local Postgres

**Files:**
- Create: `.prettierrc.json`
- Create: `docker-compose.dev.yml`
- Create: `packages/twin/package.json`
- Create: `packages/twin/tsconfig.json`
- Create: `packages/twin/vitest.config.ts`
- Create: `packages/twin/drizzle.config.ts`
- Create: `packages/twin/src/index.ts`
- Modify: `turbo.json`

- [ ] **Step 1: Root prettier config.** This mirrors `apps/payload/.prettierrc.json`; web code already follows it.

`.prettierrc.json`:
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": false
}
```

- [ ] **Step 2: Local Postgres for development.**

`docker-compose.dev.yml`:
```yaml
# Local development services only. Production uses docker-compose.yml (Easypanel).
# Port 5433 avoids clashing with a Postgres already installed on the host.
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: twin
      POSTGRES_PASSWORD: twin
      POSTGRES_DB: twin
    ports:
      - '5433:5432'
    volumes:
      - twin-pg-dev:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U twin -d twin']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  twin-pg-dev:
```

- [ ] **Step 3: Package manifest.**

`packages/twin/package.json`:
```json
{
  "name": "@repo/twin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./contract": "./src/contract/index.ts",
    "./env": "./src/env.ts",
    "./db": "./src/db/index.ts",
    "./redact": "./src/redact/index.ts",
    "./testing": "./src/testing/test-db.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun src/db/migrate.ts"
  },
  "dependencies": {
    "drizzle-orm": "0.45.3",
    "pg": "8.23.1",
    "zod": "4.5.4"
  },
  "devDependencies": {
    "@electric-sql/pglite": "0.5.8",
    "@repo/typescript-config": "*",
    "@types/node": "24.x",
    "@types/pg": "8.23.1",
    "drizzle-kit": "0.31.11",
    "typescript": "7.0.2",
    "vitest": "5.0.3"
  }
}
```

`packages/twin/tsconfig.json`:
```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "types": ["node"]
  },
  "include": ["src", "tests", "drizzle.config.ts", "vitest.config.ts"]
}
```

`packages/twin/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
```

`packages/twin/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit'

// Generation is offline (schema → SQL); only `db:migrate` touches a database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './migrations',
  schemaFilter: ['twin'],
})
```

`packages/twin/src/index.ts`:
```ts
// Intentionally empty: consumers import a subpath (`@repo/twin/contract`, `/db`, `/env`, `/redact`).
export {}
```

- [ ] **Step 4: Register the `test` task inputs in turbo.** `turbo.json` already has a `test` task. Add `check-types` coverage by leaving it as is; nothing to change for tests. Then add the twin env names that will be read at build time. None are read at build time, so **do not** touch `build.env`. Verify that turbo sees the new workspace:

Run: `bun install && bunx turbo run check-types --filter=@repo/twin --dry=json | head -5`
Expected: JSON mentioning `@repo/twin#check-types`.

- [ ] **Step 5: Start Postgres and confirm.**

Run: `docker compose -f docker-compose.dev.yml up -d postgres && docker compose -f docker-compose.dev.yml ps`
Expected: the `postgres` service is `healthy`.

- [ ] **Step 6: Commit**

```bash
git add .prettierrc.json docker-compose.dev.yml packages/twin/package.json packages/twin/tsconfig.json packages/twin/vitest.config.ts packages/twin/drizzle.config.ts packages/twin/src/index.ts bun.lock
git commit -m "chore(twin): shared twin package, root prettier config and local postgres"
```

---

### Task A2: Contract (zod schemas shared over the wire and the state record)

**Files:**
- Create: `packages/twin/src/contract/state.ts`
- Create: `packages/twin/src/contract/intent.ts`
- Create: `packages/twin/src/contract/schedule.ts`
- Create: `packages/twin/src/contract/notice.ts`
- Create: `packages/twin/src/contract/limits.ts`
- Create: `packages/twin/src/contract/query.ts`
- Create: `packages/twin/src/contract/index.ts`
- Test: `packages/twin/tests/contract/state.test.ts`, `packages/twin/tests/contract/notice.test.ts`, `packages/twin/tests/contract/query.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/twin/tests/contract/state.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ConversationState, initialConversationState } from '../../src/contract/state'

describe('ConversationState', () => {
  it('builds a complete cold initial state', () => {
    const s = initialConversationState()
    expect(s.intent).toEqual({ score: 0, tier: 'cold', lastEvaluationId: null })
    expect(s.widgetShown).toBe(false)
    expect(s.callOfferDeclined).toBe(false)
    expect(s.booking).toEqual({ status: 'none' })
    expect(s.violations).toBe(0)
    expect(s.visitor).toEqual({})
  })

  it('rejects unknown tiers loudly', () => {
    const bad = { ...initialConversationState(), intent: { score: 1, tier: 'lukewarm', lastEvaluationId: null } }
    expect(() => ConversationState.parse(bad)).toThrow()
  })

  it('fills defaults for fields added after a row was written', () => {
    const legacy = { turnCount: 3 }
    const s = ConversationState.parse(legacy)
    expect(s.turnCount).toBe(3)
    expect(s.pendingApprovals).toEqual([])
  })
})
```

`packages/twin/tests/contract/notice.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { encodeNotice, parseNotice } from '../../src/contract/notice'

describe('TwinNotice', () => {
  it('round-trips a booking notice', () => {
    const text = encodeNotice({ kind: 'booking.confirmed', startTime: '2026-10-08T14:00:00.000Z' })
    expect(parseNotice(text)).toEqual({ twinNotice: 1, kind: 'booking.confirmed', startTime: '2026-10-08T14:00:00.000Z' })
  })

  it('returns null for ordinary visitor text', () => {
    expect(parseNotice('hello there')).toBeNull()
    expect(parseNotice('{"kind":"booking.confirmed"}')).toBeNull()
  })
})
```

`packages/twin/tests/contract/query.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { normalizeQuery } from '../../src/contract/query'

describe('normalizeQuery', () => {
  it('is insensitive to case, spacing, order, duplicates and width', () => {
    expect(normalizeQuery('  React   Native  projects ')).toBe(normalizeQuery('projects react NATIVE react'))
    expect(normalizeQuery('Ｒｅａｃｔ')).toBe('react')
  })

  it('drops punctuation but keeps intra-word symbols used in tech names', () => {
    expect(normalizeQuery('Node.js, C++ & C#?')).toBe('c# c++ node.js')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun run --cwd packages/twin test`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Implement**

`packages/twin/src/contract/intent.ts`:
```ts
import { z } from 'zod'

/** The model's language-understanding output: a stable enum that survives model upgrades. */
export const IntentClass = z.enum(['requesting_call', 'hiring_signal', 'evaluating', 'browsing', 'unrelated'])
export type IntentClass = z.infer<typeof IntentClass>

/** What the conversation should do about a call, derived deterministically from the score. */
export const IntentTier = z.enum(['cold', 'warm', 'hot'])
export type IntentTier = z.infer<typeof IntentTier>

/** Lifecycle of a persisted evaluation, updated as the conversation reacts to it. */
export const EvaluationOutcome = z.enum([
  'none',
  'offered',
  'widget_rendered',
  'declined',
  'booked',
  'classifier_timeout',
])
export type EvaluationOutcome = z.infer<typeof EvaluationOutcome>

/** The evaluator's result. `reasons` is mandatory: an unexplainable score can't be tuned. */
export const IntentEvaluation = z.object({
  score: z.number(),
  tier: IntentTier,
  reasons: z.array(z.string().min(1)).min(1),
})
export type IntentEvaluation = z.infer<typeof IntentEvaluation>
```

`packages/twin/src/contract/state.ts`:
```ts
import { z } from 'zod'
import { IntentTier } from './intent'

/** Who the visitor says they are; every field is optional because people volunteer what they want. */
export const VisitorKind = z.enum(['recruiter', 'hiring_manager', 'client', 'engineer', 'other'])
export type VisitorKind = z.infer<typeof VisitorKind>

/** Categories of knowledge entries; restricted requests are tracked by category for scoring. */
export const KnowledgeCategory = z.enum(['availability', 'compensation', 'logistics', 'background', 'voice', 'other'])
export type KnowledgeCategory = z.infer<typeof KnowledgeCategory>

export const ApprovalStatus = z.enum(['pending', 'approved', 'denied', 'expired'])
export type ApprovalStatus = z.infer<typeof ApprovalStatus>

export const BookingStatus = z.enum(['none', 'confirmed', 'rescheduled', 'cancelled'])
export type BookingStatus = z.infer<typeof BookingStatus>

const Visitor = z.object({
  name: z.string().min(1).max(80).optional(),
  company: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(120).optional(),
  kind: VisitorKind.optional(),
  technical: z.boolean().optional(),
})

const Intent = z.object({
  score: z.number(),
  tier: IntentTier,
  lastEvaluationId: z.string().nullable(),
})

const Booking = z.object({
  status: BookingStatus,
  uid: z.string().optional(),
  startTime: z.string().optional(),
})

const PendingApproval = z.object({
  approvalId: z.string(),
  sourceId: z.string(),
  topic: z.string(),
})

const ApprovalDecision = z.object({
  approvalId: z.string(),
  sourceId: z.string(),
  status: z.enum(['approved', 'denied', 'expired']),
  decidedAt: z.string(),
})

/**
 * The typed per-session record. It is the only thing allowed to drive agent behaviour between
 * turns. Defaults let rows written by older deploys parse after fields are added.
 */
export const ConversationState = z.object({
  visitor: Visitor.default({}),
  returningVisitor: z.boolean().default(false),
  turnCount: z.number().int().nonnegative().default(0),
  // The turn last counted, so at-least-once hook delivery can't double count.
  lastTurnId: z.string().nullable().default(null),
  topicsCited: z.array(z.string()).default([]),
  citedSources: z.array(z.string()).default([]),
  restrictedCategoriesRequested: z.array(KnowledgeCategory).default([]),
  toolsUsed: z.array(z.string()).default([]),
  intent: Intent.default({ score: 0, tier: 'cold', lastEvaluationId: null }),
  widgetShown: z.boolean().default(false),
  callOfferMade: z.boolean().default(false),
  callOfferDeclined: z.boolean().default(false),
  booking: Booking.default({ status: 'none' }),
  pendingApprovals: z.array(PendingApproval).default([]),
  approvalDecisions: z.array(ApprovalDecision).default([]),
  violations: z.number().int().nonnegative().default(0),
  ended: z.boolean().default(false),
})
export type ConversationState = z.infer<typeof ConversationState>

/** A fresh, fully defaulted state for a new session. */
export function initialConversationState(): ConversationState {
  return ConversationState.parse({})
}

/** Adds a value to a set-like array without duplicates, preserving insertion order. */
export function addUnique<T>(list: readonly T[], ...values: readonly T[]): T[] {
  const out = [...list]
  for (const v of values) if (!out.includes(v)) out.push(v)
  return out
}
```

`packages/twin/src/contract/schedule.ts`:
```ts
import { z } from 'zod'

/** Why `schedule_call` was called: only these two triggers exist (spec §6). */
export const ScheduleTrigger = z.enum(['explicit_request', 'hot_tier'])
export type ScheduleTrigger = z.infer<typeof ScheduleTrigger>

/** The descriptor the Messenger window renders as the MSN-style booking dialog. */
export const ScheduleCallRendered = z.object({
  status: z.literal('rendered'),
  calOrigin: z.url(),
  embedScriptUrl: z.url(),
  calLink: z.string().min(1),
  bookingRef: z.string().min(1),
  ownerTimeZone: z.string().min(1),
  visitorTimeZone: z.string().min(1).nullable(),
  prefillName: z.string().min(1).optional(),
})

/** A refusal tells the model why, so it can answer naturally instead of retrying. */
export const ScheduleCallRefused = z.object({
  status: z.literal('refused'),
  reason: z.enum(['already_shown', 'not_hot']),
})

export const ScheduleCallResult = z.discriminatedUnion('status', [ScheduleCallRendered, ScheduleCallRefused])
export type ScheduleCallResult = z.infer<typeof ScheduleCallResult>
export type ScheduleCallRendered = z.infer<typeof ScheduleCallRendered>
```

`packages/twin/src/contract/notice.ts`:
```ts
import { z } from 'zod'

/**
 * A system event delivered into a session as a message (eve has no system-role channel send).
 * The window renders it as an MSN system line. Behaviour never reads it, so a spoof is harmless.
 */
export const TwinNotice = z.object({
  twinNotice: z.literal(1),
  kind: z.enum(['booking.confirmed', 'booking.rescheduled', 'booking.cancelled']),
  startTime: z.string().optional(),
})
export type TwinNotice = z.infer<typeof TwinNotice>

/** Serialises a notice into the message text sent through `attachSession().send`. */
export function encodeNotice(notice: Omit<TwinNotice, 'twinNotice'>): string {
  return JSON.stringify(TwinNotice.parse({ twinNotice: 1, ...notice }))
}

/** Parses message text as a notice; ordinary text (the common case) returns null. */
export function parseNotice(text: string): TwinNotice | null {
  if (!text.startsWith('{"twinNotice":1')) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = TwinNotice.safeParse(raw)
  return parsed.success ? parsed.data : null
}
```

`packages/twin/src/contract/limits.ts`:
```ts
import { z } from 'zod'

/**
 * Guardrail numbers in one typed place (spec §10). Change them here; the BFF and the agent read
 * the same object, so they can't drift apart.
 */
export const TWIN_LIMITS = {
  ipPerMinute: 12,
  ipPerDay: 300,
  sessionPerMinute: 8,
  sessionPerDay: 120,
  messageMaxChars: 1_000,
  maxTurnsPerConversation: 40,
  maxViolations: 3,
  retentionDays: 90,
} as const

/** Replaces a reply that leaked the prompt canary; the BFF swaps it in at the output boundary. */
export const LEAK_DEFLECTION = "Ha, I'll keep how I work to myself. Happy to talk about what I've built, though."

/** HTTP status the BFF uses per refusal kind; the window maps status → CMS label. */
export const REFUSAL_STATUS = { throttled: 429, too_long: 413, ended: 403, offline: 503 } as const

/** Body of every refusal the BFF returns, so the window can show the matching CMS label. */
export const TwinRefusal = z.object({
  ok: z.literal(false),
  kind: z.enum(['throttled', 'ended', 'too_long', 'offline']),
})
export type TwinRefusal = z.infer<typeof TwinRefusal>
```

`packages/twin/src/contract/query.ts`:
```ts
/**
 * Canonical form of a search query, used as the per-session cache key. Order and repetition of
 * terms don't change what the knowledge base returns, so they must not change the key.
 */
export function normalizeQuery(query: string): string {
  const terms = query
    .normalize('NFKC')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}#+]+$/gu, ''))
    .filter((t) => t.length > 0 && /[\p{L}\p{N}]/u.test(t))
  return [...new Set(terms)].sort().join(' ')
}
```

`packages/twin/src/contract/index.ts`:
```ts
export * from './intent'
export * from './state'
export * from './schedule'
export * from './notice'
export * from './limits'
export * from './query'
```

- [ ] **Step 4: Run the tests**

Run: `bun run --cwd packages/twin test`
Expected: all contract tests PASS. If `normalizeQuery('Node.js, C++ & C#?')` fails, fix the regex rather than the test. Tech names keep internal dots and trailing `#`/`+`.

- [ ] **Step 5: Commit**

```bash
git add packages/twin/src/contract packages/twin/tests/contract
git commit -m "feat(twin): typed conversation state, intent, schedule and notice contract"
```

---

### Task A3: Env schemas (fail loudly at startup)

**Files:**
- Create: `packages/twin/src/env.ts`
- Test: `packages/twin/tests/env.test.ts`

- [ ] **Step 1: Failing test**

`packages/twin/tests/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { agentsEnvSchema, parseEnv, webTwinEnvSchema } from '../src/env'

const secret = 'x'.repeat(32)
const sa = Buffer.from(JSON.stringify({ client_email: 'twin@p.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' })).toString('base64')

const agents = {
  TWIN_DATABASE_URL: 'postgres://twin:twin@localhost:5433/twin',
  WORKFLOW_POSTGRES_URL: 'postgres://twin:twin@localhost:5433/twin',
  OPENROUTER_API_KEY: 'sk-or-1',
  TWIN_JWT_SECRET: secret,
  TWIN_PROMPT_CANARY: 'canary-0123456789abcdef',
  TWIN_STABLE_KEY_SECRET: secret,
  TWIN_REDACT_SECRET: secret,
  CMS_URL: 'http://localhost:3001',
  PAYLOAD_MCP_URL: 'http://localhost:3001/api/mcp',
  PAYLOAD_MCP_API_KEY: 'k',
  GOOGLE_SERVICE_ACCOUNT_JSON: sa,
  GOOGLE_CALENDAR_ID: 'owner@example.com',
  OWNER_TIMEZONE: 'America/Sao_Paulo',
  CAL_LINK: 'vinicius/intro',
  CAL_WEBHOOK_SECRET: secret,
  TWIN_BOOKING_REF_SECRET: secret,
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_WEBHOOK_SECRET: 'tg_secret_value_1234',
  TELEGRAM_OWNER_USER_ID: '42',
  EXA_API_KEY: 'exa',
}

describe('env', () => {
  it('parses a complete agents env and applies defaults', () => {
    const env = parseEnv(agentsEnvSchema, agents)
    expect(env.TWIN_MODEL_FALLBACKS).toEqual(['deepseek/deepseek-v4.1-flash'])
    expect(env.TWIN_APPROVAL_TIMEOUT).toBe('15m')
    expect(env.GOOGLE_SERVICE_ACCOUNT_JSON.client_email).toBe('twin@p.iam.gserviceaccount.com')
    expect(env.CAL_ORIGIN).toBe('https://cal.com')
  })

  it('names every missing or invalid variable in one error', () => {
    expect(() => parseEnv(agentsEnvSchema, { ...agents, OPENROUTER_API_KEY: '', OWNER_TIMEZONE: 'Mars/Base' })).toThrow(
      /OPENROUTER_API_KEY[\s\S]*OWNER_TIMEZONE/,
    )
  })

  it('parses the web BFF env', () => {
    const env = parseEnv(webTwinEnvSchema, {
      TWIN_AGENT_URL: 'http://agents:3000',
      TWIN_JWT_SECRET: secret,
      TWIN_COOKIE_SECRET: secret,
      TWIN_DATABASE_URL: agents.TWIN_DATABASE_URL,
      TWIN_REDACT_SECRET: secret,
      TWIN_PROMPT_CANARY: agents.TWIN_PROMPT_CANARY,
      CMS_URL: 'http://cms:3001',
    })
    expect(env.TWIN_DAILY_SPEND_USD).toBe(5)
  })
})
```

- [ ] **Step 2: Run it.** Expect FAIL (module missing).

- [ ] **Step 3: Implement**

`packages/twin/src/env.ts`:
```ts
import { z } from 'zod'

const secret = z.string().min(32, 'must be at least 32 characters')
const csv = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.string().min(1)).min(1))

/** True when the runtime knows the IANA zone; rejects typos before they reach Google or Cal.com. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const timeZone = z.string().refine(isTimeZone, 'must be an IANA time zone')

const serviceAccount = z
  .string()
  .transform((b64, ctx) => {
    try {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as unknown
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be base64-encoded JSON' })
      return z.NEVER
    }
  })
  .pipe(z.object({ client_email: z.email(), private_key: z.string().includes('PRIVATE KEY') }))

/**
 * Model defaults, exported because `agent/agent.ts` is evaluated at build time (before the full
 * env exists) and must resolve the same ids as the runtime schema.
 */
export const MODEL_DEFAULTS = {
  model: 'anthropic/claude-sonnet-5.5',
  fallbacks: ['deepseek/deepseek-v4.1-flash'],
  classifier: 'deepseek/deepseek-v4.1-flash',
  contextTokens: 1_000_000,
} as const

/** Every variable the agents service reads. Parsed once, lazily, on first use at runtime. */
export const agentsEnvSchema = z.object({
  TWIN_DATABASE_URL: z.url(),
  WORKFLOW_POSTGRES_URL: z.url(),
  OPENROUTER_API_KEY: z.string().min(1),
  TWIN_MODEL: z.string().min(1).default(MODEL_DEFAULTS.model),
  TWIN_MODEL_FALLBACKS: csv.default([...MODEL_DEFAULTS.fallbacks]),
  TWIN_MODEL_CONTEXT_TOKENS: z.coerce.number().int().positive().default(MODEL_DEFAULTS.contextTokens),
  TWIN_CLASSIFIER_MODEL: z.string().min(1).default(MODEL_DEFAULTS.classifier),
  TWIN_JWT_SECRET: secret,
  TWIN_PROMPT_CANARY: z.string().min(16),
  TWIN_STABLE_KEY_SECRET: secret,
  TWIN_REDACT_SECRET: secret,
  CMS_URL: z.url(),
  PAYLOAD_MCP_URL: z.url(),
  PAYLOAD_MCP_API_KEY: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_JSON: serviceAccount,
  GOOGLE_CALENDAR_ID: z.string().min(1),
  OWNER_TIMEZONE: timeZone,
  CAL_ORIGIN: z.url().default('https://cal.com'),
  // Official embed loader (cal.com docs: embed snippet); differs for self-hosted Cal.diy.
  CAL_EMBED_SCRIPT_URL: z.url().default('https://app.cal.com/embed/embed.js'),
  CAL_LINK: z.string().regex(/^[\w-]+\/[\w-]+$/, 'must be "<user>/<event-slug>"'),
  CAL_WEBHOOK_SECRET: secret,
  TWIN_BOOKING_REF_SECRET: secret,
  // Bot API base URL; Telegram documents running a local Bot API server, and offline evals use a stub.
  TELEGRAM_API_BASE: z.url().default('https://api.telegram.org'),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[\w-]{16,256}$/),
  TELEGRAM_OWNER_USER_ID: z.string().regex(/^\d+$/),
  EXA_API_KEY: z.string().min(1),
  TWIN_APPROVAL_TIMEOUT: z.string().regex(/^\d+(s|m|h)$/).default('15m'),
  TWIN_CLASSIFIER_TIMEOUT_MS: z.coerce.number().int().positive().default(4_000),
})
export type AgentsEnv = z.infer<typeof agentsEnvSchema>

/** Every variable the web BFF reads (server-only; never NEXT_PUBLIC_). */
export const webTwinEnvSchema = z.object({
  TWIN_AGENT_URL: z.url(),
  TWIN_JWT_SECRET: secret,
  TWIN_COOKIE_SECRET: secret,
  TWIN_DATABASE_URL: z.url(),
  TWIN_REDACT_SECRET: secret,
  TWIN_PROMPT_CANARY: z.string().min(16),
  TWIN_DAILY_SPEND_USD: z.coerce.number().positive().default(5),
  CMS_URL: z.url(),
})
export type WebTwinEnv = z.infer<typeof webTwinEnvSchema>

/** Parses an env source, throwing one error that lists every bad variable. */
export function parseEnv<S extends z.ZodType>(schema: S, source: Record<string, string | undefined>): z.infer<S> {
  const result = schema.safeParse(source)
  if (result.success) return result.data
  const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid environment:\n${lines.join('\n')}`)
}
```

- [ ] **Step 4: Run it.** Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/twin/src/env.ts packages/twin/tests/env.test.ts
git commit -m "feat(twin): typed env schemas for the agent and the web BFF"
```

---

### Task A4: Database schema, client, migrations and the pglite test harness

**Files:**
- Create: `packages/twin/src/db/schema.ts`
- Create: `packages/twin/src/db/client.ts`
- Create: `packages/twin/src/db/migrate.ts`
- Create: `packages/twin/src/db/index.ts`
- Create: `packages/twin/src/testing/test-db.ts`
- Create: `packages/twin/migrations/*` (generated)
- Test: `packages/twin/tests/db/schema.test.ts`

- [ ] **Step 1: Failing test** (proves migrations apply and the reasons constraint holds)

`packages/twin/tests/db/schema.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../src/testing/test-db'
import { conversations, intentEvaluations, visitors } from '../../src/db/schema'
import { initialConversationState } from '../../src/contract'

let t: TestDb
afterEach(async () => t?.close())

describe('twin schema', () => {
  it('applies the committed migrations into the twin schema', async () => {
    t = await createTestDb()
    const rows = await t.db.execute(sql`select table_name from information_schema.tables where table_schema = 'twin' order by 1`)
    const names = rows.rows.map((r) => (r as { table_name: string }).table_name)
    expect(names).toEqual(
      expect.arrayContaining(['approvals', 'bookings', 'conversations', 'intent_evaluations', 'rate_limits', 'search_cache', 'spend_ledger', 'transcripts', 'visitors']),
    )
  })

  it('refuses an evaluation without reasons at the database level', async () => {
    t = await createTestDb()
    const [v] = await t.db.insert(visitors).values({}).returning()
    await t.db.insert(conversations).values({ sessionId: 's1', visitorId: v!.id, state: initialConversationState() })
    await expect(
      t.db.insert(intentEvaluations).values({ sessionId: 's1', turnId: 't1', sequence: 1, score: 0, tier: 'cold', reasons: [], signals: {} }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run it.** Expect FAIL.

- [ ] **Step 3: Schema**

`packages/twin/src/db/schema.ts`:
```ts
import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import type { ConversationState } from '../contract/state'

/** Everything the app owns lives in its own schema, apart from eve's Workflow world tables. */
export const twin = pgSchema('twin')

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const visitors = twin.table(
  'visitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // HMAC of a volunteered email: links devices without storing the address.
    stableKeyHash: text('stable_key_hash'),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('visitors_stable_key_idx').on(t.stableKeyHash), index('visitors_last_seen_idx').on(t.lastSeenAt)],
)

export const conversations = twin.table(
  'conversations',
  {
    sessionId: text('session_id').primaryKey(),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    state: jsonb('state').$type<ConversationState>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversations_visitor_idx').on(t.visitorId)],
)

const sessionRef = () =>
  text('session_id')
    .notNull()
    .references(() => conversations.sessionId, { onDelete: 'cascade' })

export const intentEvaluations = twin.table(
  'intent_evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: sessionRef(),
    turnId: text('turn_id').notNull(),
    sequence: integer('sequence').notNull(),
    score: real('score').notNull(),
    tier: text('tier').notNull(),
    classification: text('classification'),
    reasons: text('reasons').array().notNull(),
    signals: jsonb('signals').notNull(),
    outcome: text('outcome').notNull().default('none'),
    latencyMs: integer('latency_ms'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('intent_evaluations_message_uq').on(t.sessionId, t.turnId, t.sequence),
    check('intent_evaluations_reasons_nonempty', sql`cardinality(${t.reasons}) >= 1`),
  ],
)

export const approvals = twin.table('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: sessionRef(),
  sourceId: text('source_id').notNull(),
  topic: text('topic').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'),
  webhookUrl: text('webhook_url'),
  telegramMessageId: bigint('telegram_message_id', { mode: 'number' }),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  actor: text('actor'),
  reasoning: text('reasoning'),
})

export const bookings = twin.table('bookings', {
  uid: text('uid').primaryKey(),
  sessionId: sessionRef(),
  status: text('status').notNull(),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime: timestamp('end_time', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})

export const transcripts = twin.table(
  'transcripts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionId: sessionRef(),
    role: text('role').notNull(),
    turnId: text('turn_id').notNull(),
    sequence: integer('sequence').notNull(),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('transcripts_message_uq').on(t.sessionId, t.turnId, t.sequence, t.role)],
)

export const searchCache = twin.table(
  'search_cache',
  {
    sessionId: sessionRef(),
    queryNorm: text('query_norm').notNull(),
    result: jsonb('result').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.queryNorm] })],
)

export const rateLimits = twin.table(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
)

export const spendLedger = twin.table(
  'spend_ledger',
  {
    idempotencyKey: text('idempotency_key').primaryKey(),
    sessionId: text('session_id').notNull(),
    modelId: text('model_id').notNull(),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }).notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('spend_ledger_created_idx').on(t.createdAt)],
)
```

`packages/twin/src/db/client.ts`:
```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'
import * as schema from './schema'

/** Driver-agnostic handle: production uses node-postgres, tests use pglite with the same schema. */
export type TwinDb = PgDatabase<PgQueryResultHKT, typeof schema>

/** Opens a pooled connection to the twin database. One per process. */
export function createTwinDb(url: string): { db: TwinDb; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: url, max: 10 })
  return { db: drizzle(pool, { schema }), close: () => pool.end() }
}
```

`packages/twin/src/db/migrate.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

/** Folder of committed SQL migrations, resolved from this file so it works from any cwd. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url))

/** Applies pending migrations; run before the agents service starts (see its Dockerfile). */
async function main(): Promise<void> {
  const url = process.env.TWIN_DATABASE_URL
  if (!url) throw new Error('TWIN_DATABASE_URL is required to migrate')
  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: 'twin' })
  } finally {
    await pool.end()
  }
}

if (import.meta.main) await main()
```

`packages/twin/src/testing/test-db.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '../db/schema'
import type { TwinDb } from '../db/client'

/** An in-process Postgres for tests: zero network, same migrations as production. */
export interface TestDb {
  db: TwinDb
  close: () => Promise<void>
}

/** Creates a fresh, migrated in-memory database. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../migrations', import.meta.url)),
    migrationsSchema: 'twin',
  })
  return { db: db as unknown as TwinDb, close: () => client.close() }
}
```

`packages/twin/src/db/index.ts`:
```ts
export * as schema from './schema'
export { createTwinDb, type TwinDb } from './client'
export * from './queries/conversations'
export * from './queries/visitors'
export * from './queries/evaluations'
export * from './queries/approvals'
export * from './queries/bookings'
export * from './queries/transcripts'
export * from './queries/search-cache'
export * from './queries/rate-limits'
export * from './queries/spend'
export * from './queries/retention'
```

> The query modules come in A5. Until then, temporarily keep only the first two export lines of `index.ts`, and add the rest in A5 step 3. This is part of the same task sequence, not a placeholder.

- [ ] **Step 4: Generate the migration**

Run: `bun run --cwd packages/twin db:generate`
Expected: `packages/twin/migrations/0000_<name>.sql`, plus `meta/`, containing `CREATE SCHEMA "twin"` and all 9 tables with the check constraint.

- [ ] **Step 5: Run the tests**

Run: `bun run --cwd packages/twin test`
Expected: PASS. If the `as unknown as TwinDb` cast fails type checking, do not widen `TwinDb` to `any`. Instead type `TestDb.db` as `PgliteDatabase<typeof schema>`, and make every query accept `TwinDb | PgliteDatabase<typeof schema>` through a single exported alias `AnyTwinDb` defined in `client.ts`.

- [ ] **Step 6: Apply it to the dev database**

Run: `TWIN_DATABASE_URL=postgres://twin:twin@localhost:5433/twin bun run --cwd packages/twin db:migrate`
Expected: exits 0. Then run `docker compose -f docker-compose.dev.yml exec postgres psql -U twin -c '\dt twin.*'`; it lists 9 tables.

- [ ] **Step 7: Commit**

```bash
git add packages/twin/src/db packages/twin/src/testing packages/twin/migrations packages/twin/tests/db
git commit -m "feat(twin): postgres schema for conversations, evaluations, approvals and limits"
```

---

### Task A5: Typed queries

**Files:**
- Create: `packages/twin/src/db/queries/{conversations,visitors,evaluations,approvals,bookings,transcripts,search-cache,rate-limits,spend,retention}.ts`
- Modify: `packages/twin/src/db/index.ts` (restore the full export list from A4)
- Test: `packages/twin/tests/db/queries.test.ts`

- [ ] **Step 1: Failing tests**

`packages/twin/tests/db/queries.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../src/testing/test-db'
import {
  createConversation,
  createVisitor,
  decideApproval,
  createApproval,
  deleteVisitor,
  getConversation,
  hitRateLimit,
  insertEvaluation,
  ownsSession,
  purgeExpired,
  recallVisitorHistory,
  recordSpend,
  spendSince,
  updateConversation,
  getCachedSearch,
  putCachedSearch,
  setEvaluationOutcome,
} from '../../src/db'

let t: TestDb
let visitorId: string
beforeEach(async () => {
  t = await createTestDb()
  visitorId = await createVisitor(t.db)
  await createConversation(t.db, 'sess-1', visitorId)
})
afterEach(async () => t.close())

describe('conversations', () => {
  it('reads back a fully defaulted state', async () => {
    const c = await getConversation(t.db, 'sess-1')
    expect(c?.state.intent.tier).toBe('cold')
  })

  it('applies updates atomically and validates before writing', async () => {
    await updateConversation(t.db, 'sess-1', (s) => ({ ...s, turnCount: s.turnCount + 1 }))
    await expect(
      updateConversation(t.db, 'sess-1', (s) => ({ ...s, intent: { ...s.intent, tier: 'boiling' as never } })),
    ).rejects.toThrow()
    expect((await getConversation(t.db, 'sess-1'))?.state.turnCount).toBe(1)
  })

  it('checks session ownership', async () => {
    const other = await createVisitor(t.db)
    expect(await ownsSession(t.db, 'sess-1', visitorId)).toBe(true)
    expect(await ownsSession(t.db, 'sess-1', other)).toBe(false)
  })
})

describe('evaluations', () => {
  it('is idempotent per message and tracks outcome', async () => {
    const row = { sessionId: 'sess-1', turnId: 't1', sequence: 2, score: 4, tier: 'warm' as const, classification: 'evaluating' as const, reasons: ['availability asked'], signals: {}, latencyMs: 120 }
    const id = await insertEvaluation(t.db, row)
    expect(id).not.toBeNull()
    expect(await insertEvaluation(t.db, row)).toBeNull()
    await setEvaluationOutcome(t.db, id!, 'offered')
  })
})

describe('approvals', () => {
  it('decides a pending approval exactly once', async () => {
    const id = await createApproval(t.db, { sessionId: 'sess-1', sourceId: 'knowledge:7', topic: 'notice period', reason: 'asked' })
    const first = await decideApproval(t.db, id, { status: 'approved', actor: 'telegram:42', reasoning: 'Approved via Telegram' })
    const second = await decideApproval(t.db, id, { status: 'expired', actor: 'system', reasoning: 'timeout' })
    expect(first?.status).toBe('approved')
    expect(second).toBeNull()
  })
})

describe('rate limits and spend', () => {
  it('counts hits per fixed window', async () => {
    const now = new Date('2026-10-04T12:00:30Z')
    expect(await hitRateLimit(t.db, 'ip:1.2.3.4', 60, now)).toBe(1)
    expect(await hitRateLimit(t.db, 'ip:1.2.3.4', 60, now)).toBe(2)
    expect(await hitRateLimit(t.db, 'ip:1.2.3.4', 60, new Date('2026-10-04T12:01:01Z'))).toBe(1)
  })

  it('sums spend since a point in time, ignoring duplicate keys', async () => {
    await recordSpend(t.db, { idempotencyKey: 'a', sessionId: 'sess-1', modelId: 'm', costUsd: 0.01, inputTokens: 1, outputTokens: 1 })
    await recordSpend(t.db, { idempotencyKey: 'a', sessionId: 'sess-1', modelId: 'm', costUsd: 0.01, inputTokens: 1, outputTokens: 1 })
    await recordSpend(t.db, { idempotencyKey: 'b', sessionId: 'sess-1', modelId: 'm', costUsd: 0.02, inputTokens: 1, outputTokens: 1 })
    expect(await spendSince(t.db, new Date(0))).toBeCloseTo(0.03)
  })
})

describe('search cache', () => {
  it('stores and returns a result per normalised query', async () => {
    await putCachedSearch(t.db, 'sess-1', 'react', { items: [] })
    expect(await getCachedSearch(t.db, 'sess-1', 'react')).toEqual({ items: [] })
    expect(await getCachedSearch(t.db, 'sess-1', 'vue')).toBeNull()
  })
})

describe('retention', () => {
  it('purges visitors idle beyond the retention window with everything they own', async () => {
    const now = new Date('2027-01-10T00:00:00Z')
    const purged = await purgeExpired(t.db, now, 1)
    expect(purged.visitors).toBe(1)
    expect(await getConversation(t.db, 'sess-1')).toBeNull()
  })

  it('deletes one visitor on request', async () => {
    await deleteVisitor(t.db, visitorId)
    expect(await getConversation(t.db, 'sess-1')).toBeNull()
  })
})

describe('visitor history', () => {
  it('summarises earlier sessions, excluding the current one', async () => {
    await updateConversation(t.db, 'sess-1', (s) => ({ ...s, visitor: { name: 'Ana', company: 'Acme' }, topicsCited: ['projects'], callOfferDeclined: true }))
    await createConversation(t.db, 'sess-2', visitorId)
    const h = await recallVisitorHistory(t.db, visitorId, 'sess-2')
    expect(h).toEqual({ visits: 1, name: 'Ana', company: 'Acme', role: undefined, kind: undefined, topics: ['projects'], booked: false, declinedCall: true })
  })
})
```

- [ ] **Step 2: Run them.** Expect FAIL.

- [ ] **Step 3: Implement the queries**

`packages/twin/src/db/queries/conversations.ts`:
```ts
import { and, eq } from 'drizzle-orm'
import { ConversationState, initialConversationState } from '../../contract/state'
import type { TwinDb } from '../client'
import { conversations } from '../schema'

/** Records that a visitor owns a new eve session; idempotent for retried creates. */
export async function createConversation(db: TwinDb, sessionId: string, visitorId: string): Promise<void> {
  await db
    .insert(conversations)
    .values({ sessionId, visitorId, state: initialConversationState() })
    .onConflictDoNothing()
}

/** Loads and validates a conversation; null when the session is unknown (or purged). */
export async function getConversation(
  db: TwinDb,
  sessionId: string,
): Promise<{ visitorId: string; state: ConversationState } | null> {
  const [row] = await db.select().from(conversations).where(eq(conversations.sessionId, sessionId))
  return row ? { visitorId: row.visitorId, state: ConversationState.parse(row.state) } : null
}

/**
 * Applies a pure update under a row lock and validates the result before writing, so concurrent
 * writers (tools, hooks, webhooks) never lose updates or persist an invalid record.
 */
export async function updateConversation(
  db: TwinDb,
  sessionId: string,
  update: (state: ConversationState) => ConversationState,
): Promise<ConversationState> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(conversations).where(eq(conversations.sessionId, sessionId)).for('update')
    if (!row) throw new Error(`Unknown conversation ${sessionId}`)
    const next = ConversationState.parse(update(ConversationState.parse(row.state)))
    await tx.update(conversations).set({ state: next, updatedAt: new Date() }).where(eq(conversations.sessionId, sessionId))
    return next
  })
}

/** True when the session belongs to the visitor; the BFF checks this on every proxied call. */
export async function ownsSession(db: TwinDb, sessionId: string, visitorId: string): Promise<boolean> {
  const rows = await db
    .select({ sessionId: conversations.sessionId })
    .from(conversations)
    .where(and(eq(conversations.sessionId, sessionId), eq(conversations.visitorId, visitorId)))
  return rows.length === 1
}

/** All eve session ids a visitor owns (used by the deletion endpoint to reset them). */
export async function listVisitorSessions(db: TwinDb, visitorId: string): Promise<string[]> {
  const rows = await db.select({ sessionId: conversations.sessionId }).from(conversations).where(eq(conversations.visitorId, visitorId))
  return rows.map((r) => r.sessionId)
}
```

`packages/twin/src/db/queries/visitors.ts`:
```ts
import { and, desc, eq, inArray, ne, or } from 'drizzle-orm'
import { ConversationState, type VisitorKind } from '../../contract/state'
import type { TwinDb } from '../client'
import { conversations, visitors } from '../schema'

/** Creates an anonymous visitor and returns its id (the signed cookie carries it). */
export async function createVisitor(db: TwinDb): Promise<string> {
  const [row] = await db.insert(visitors).values({}).returning({ id: visitors.id })
  if (!row) throw new Error('Visitor insert returned no row')
  return row.id
}

/** True when the visitor still exists; a purged cookie must mint a fresh visitor. */
export async function visitorExists(db: TwinDb, visitorId: string): Promise<boolean> {
  const rows = await db.select({ id: visitors.id }).from(visitors).where(eq(visitors.id, visitorId))
  return rows.length === 1
}

/** Marks activity; retention is measured from the last visit, not the first. */
export async function touchVisitor(db: TwinDb, visitorId: string, now = new Date()): Promise<void> {
  await db.update(visitors).set({ lastSeenAt: now }).where(eq(visitors.id, visitorId))
}

/** Stores the HMAC of a volunteered stable identifier to recognise the person on other devices. */
export async function setStableKeyHash(db: TwinDb, visitorId: string, keyHash: string): Promise<void> {
  await db.update(visitors).set({ stableKeyHash: keyHash }).where(eq(visitors.id, visitorId))
}

/** What the twin remembers about a returning visitor, derived from their earlier sessions. */
export interface VisitorHistory {
  visits: number
  name: string | undefined
  company: string | undefined
  role: string | undefined
  kind: VisitorKind | undefined
  topics: string[]
  booked: boolean
  declinedCall: boolean
}

/**
 * Summarises previous sessions of this visitor and of any visitor sharing its stable key.
 * Derived on read so there is no second copy of conversation data to keep in sync.
 */
export async function recallVisitorHistory(
  db: TwinDb,
  visitorId: string,
  currentSessionId: string,
): Promise<VisitorHistory | null> {
  const [self] = await db.select().from(visitors).where(eq(visitors.id, visitorId))
  if (!self) return null
  const owners = self.stableKeyHash
    ? or(eq(conversations.visitorId, visitorId), inArray(conversations.visitorId, db.select({ id: visitors.id }).from(visitors).where(eq(visitors.stableKeyHash, self.stableKeyHash))))
    : eq(conversations.visitorId, visitorId)
  const rows = await db
    .select({ state: conversations.state })
    .from(conversations)
    .where(and(owners, ne(conversations.sessionId, currentSessionId)))
    .orderBy(desc(conversations.updatedAt))
    .limit(10)
  if (rows.length === 0) return null
  const states = rows.map((r) => ConversationState.parse(r.state))
  const pick = <K extends keyof ConversationState['visitor']>(k: K) => states.find((s) => s.visitor[k] !== undefined)?.visitor[k]
  return {
    visits: states.length,
    name: pick('name'),
    company: pick('company'),
    role: pick('role'),
    kind: pick('kind'),
    topics: [...new Set(states.flatMap((s) => s.topicsCited))].slice(0, 8),
    booked: states.some((s) => s.booking.status === 'confirmed' || s.booking.status === 'rescheduled'),
    declinedCall: states.some((s) => s.callOfferDeclined),
  }
}
```

`packages/twin/src/db/queries/evaluations.ts`:
```ts
import { desc, eq } from 'drizzle-orm'
import type { EvaluationOutcome, IntentClass, IntentTier } from '../../contract/intent'
import type { TwinDb } from '../client'
import { intentEvaluations } from '../schema'

/** One evaluation row; `reasons` must be non-empty (also enforced by a DB check constraint). */
export interface NewEvaluation {
  sessionId: string
  turnId: string
  sequence: number
  score: number
  tier: IntentTier
  classification: IntentClass | null
  reasons: string[]
  signals: Record<string, unknown>
  latencyMs: number | null
  outcome?: EvaluationOutcome
}

/** Inserts an evaluation; returns null when this message was already evaluated (at-least-once hooks). */
export async function insertEvaluation(db: TwinDb, e: NewEvaluation): Promise<string | null> {
  if (e.reasons.length === 0) throw new Error('An evaluation needs at least one reason')
  const rows = await db
    .insert(intentEvaluations)
    .values({ ...e, outcome: e.outcome ?? 'none' })
    .onConflictDoNothing()
    .returning({ id: intentEvaluations.id })
  return rows[0]?.id ?? null
}

/** Records what happened after an evaluation, which is the label the weights are tuned against. */
export async function setEvaluationOutcome(db: TwinDb, id: string, outcome: EvaluationOutcome): Promise<void> {
  await db.update(intentEvaluations).set({ outcome }).where(eq(intentEvaluations.id, id))
}

/** The most recent evaluation id of a session, or null. */
export async function latestEvaluationId(db: TwinDb, sessionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: intentEvaluations.id })
    .from(intentEvaluations)
    .where(eq(intentEvaluations.sessionId, sessionId))
    .orderBy(desc(intentEvaluations.createdAt))
    .limit(1)
  return row?.id ?? null
}
```

`packages/twin/src/db/queries/approvals.ts`:
```ts
import { and, eq } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { approvals } from '../schema'

/** Persists a pending owner approval and returns its id (also the Telegram callback payload). */
export async function createApproval(
  db: TwinDb,
  a: { sessionId: string; sourceId: string; topic: string; reason: string },
): Promise<string> {
  const [row] = await db.insert(approvals).values(a).returning({ id: approvals.id })
  if (!row) throw new Error('Approval insert returned no row')
  return row.id
}

/** Stores where the decision must be delivered (workflow webhook) and the Telegram message to edit. */
export async function attachApprovalDelivery(
  db: TwinDb,
  id: string,
  delivery: { webhookUrl: string; telegramMessageId: number },
): Promise<void> {
  await db.update(approvals).set(delivery).where(eq(approvals.id, id))
}

/** A settled approval as returned to callers. */
export interface DecidedApproval {
  id: string
  sessionId: string
  sourceId: string
  status: 'approved' | 'denied' | 'expired'
  webhookUrl: string | null
  telegramMessageId: number | null
  decidedAt: Date
}

/**
 * Settles a pending approval exactly once. Returns null if it was already decided, so a late
 * Telegram tap after the timeout (or a double tap) can't flip an outcome.
 */
export async function decideApproval(
  db: TwinDb,
  id: string,
  d: { status: 'approved' | 'denied' | 'expired'; actor: string; reasoning: string },
  now = new Date(),
): Promise<DecidedApproval | null> {
  const [row] = await db
    .update(approvals)
    .set({ status: d.status, actor: d.actor, reasoning: d.reasoning, decidedAt: now })
    .where(and(eq(approvals.id, id), eq(approvals.status, 'pending')))
    .returning()
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.sessionId,
    sourceId: row.sourceId,
    status: d.status,
    webhookUrl: row.webhookUrl,
    telegramMessageId: row.telegramMessageId,
    decidedAt: now,
  }
}
```

`packages/twin/src/db/queries/bookings.ts`:
```ts
import type { TwinDb } from '../client'
import { bookings } from '../schema'

/** Upserts a booking by Cal.com uid; only ids, status and times are stored, never attendee PII. */
export async function upsertBooking(
  db: TwinDb,
  b: { uid: string; sessionId: string; status: string; startTime: Date | null; endTime: Date | null },
): Promise<void> {
  await db
    .insert(bookings)
    .values(b)
    .onConflictDoUpdate({ target: bookings.uid, set: { status: b.status, startTime: b.startTime, endTime: b.endTime, receivedAt: new Date() } })
}
```

`packages/twin/src/db/queries/transcripts.ts`:
```ts
import type { TwinDb } from '../client'
import { transcripts } from '../schema'

/** Appends one already-redacted message; duplicates from at-least-once hooks are ignored. */
export async function appendTranscript(
  db: TwinDb,
  m: { sessionId: string; role: 'visitor' | 'twin'; turnId: string; sequence: number; text: string },
): Promise<void> {
  await db.insert(transcripts).values(m).onConflictDoNothing()
}
```

`packages/twin/src/db/queries/search-cache.ts`:
```ts
import { and, eq } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { searchCache } from '../schema'

/** Cached knowledge-base result for this session and normalised query, or null. */
export async function getCachedSearch(db: TwinDb, sessionId: string, queryNorm: string): Promise<unknown | null> {
  const [row] = await db
    .select({ result: searchCache.result })
    .from(searchCache)
    .where(and(eq(searchCache.sessionId, sessionId), eq(searchCache.queryNorm, queryNorm)))
  return row ? row.result : null
}

/** Stores a result; a concurrent duplicate keeps the first write. */
export async function putCachedSearch(db: TwinDb, sessionId: string, queryNorm: string, result: unknown): Promise<void> {
  await db.insert(searchCache).values({ sessionId, queryNorm, result }).onConflictDoNothing()
}
```

`packages/twin/src/db/queries/rate-limits.ts`:
```ts
import { sql } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { rateLimits } from '../schema'

/** Start of the fixed window containing `now`. */
export function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000
  return new Date(Math.floor(now.getTime() / ms) * ms)
}

/** Atomically counts one hit in the key's current window and returns the new count. */
export async function hitRateLimit(db: TwinDb, key: string, windowSeconds: number, now = new Date()): Promise<number> {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: windowStart(now, windowSeconds), count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count })
  if (!row) throw new Error('Rate limit upsert returned no row')
  return row.count
}
```

`packages/twin/src/db/queries/spend.ts`:
```ts
import { gte, sql, sum } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { spendLedger } from '../schema'

/**
 * Records one model call. eve reports tokens and provider metadata (where OpenRouter's cost
 * lives) in separate events, so both upsert the same key and the larger value wins.
 */
export async function recordSpend(
  db: TwinDb,
  s: { idempotencyKey: string; sessionId: string; modelId: string; costUsd: number; inputTokens: number; outputTokens: number },
): Promise<void> {
  await db
    .insert(spendLedger)
    .values(s)
    .onConflictDoUpdate({
      target: spendLedger.idempotencyKey,
      set: {
        costUsd: sql`greatest(${spendLedger.costUsd}, excluded.cost_usd)`,
        inputTokens: sql`greatest(${spendLedger.inputTokens}, excluded.input_tokens)`,
        outputTokens: sql`greatest(${spendLedger.outputTokens}, excluded.output_tokens)`,
      },
    })
}

/** Total recorded spend since `since` (the BFF passes the start of the UTC day). */
export async function spendSince(db: TwinDb, since: Date): Promise<number> {
  const [row] = await db.select({ total: sum(spendLedger.costUsd) }).from(spendLedger).where(gte(spendLedger.createdAt, since))
  return Number(row?.total ?? 0)
}
```

`packages/twin/src/db/queries/retention.ts`:
```ts
import { eq, lt } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { rateLimits, spendLedger, visitors } from '../schema'

/**
 * Deletes visitors idle longer than `retentionDays` (cascading to conversations, evaluations,
 * approvals, bookings, transcripts and cache), plus stale rate-limit windows and spend rows.
 */
export async function purgeExpired(
  db: TwinDb,
  now: Date,
  retentionDays: number,
): Promise<{ visitors: number; rateLimits: number; spend: number }> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000)
  const v = await db.delete(visitors).where(lt(visitors.lastSeenAt, cutoff)).returning({ id: visitors.id })
  const r = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(now.getTime() - 2 * 86_400_000)))
    .returning({ key: rateLimits.key })
  const s = await db.delete(spendLedger).where(lt(spendLedger.createdAt, cutoff)).returning({ k: spendLedger.idempotencyKey })
  return { visitors: v.length, rateLimits: r.length, spend: s.length }
}

/** Deletes one visitor and everything they own (the deletion endpoint). */
export async function deleteVisitor(db: TwinDb, visitorId: string): Promise<void> {
  await db.delete(visitors).where(eq(visitors.id, visitorId))
}
```

Then restore `packages/twin/src/db/index.ts` to the full export list shown in A4.

- [ ] **Step 4: Run the tests and type check**

Run: `bun run --cwd packages/twin test && bun run --cwd packages/twin check-types`
Expected: PASS and clean. In the retention test, `purgeExpired(..., 1)` with `now` in 2027 must delete the visitor created "now" (2026), because one day has passed.

- [ ] **Step 5: Commit**

```bash
git add packages/twin/src/db packages/twin/tests/db
git commit -m "feat(twin): typed queries for state, evaluations, approvals, limits, spend and retention"
```

---

### Task A6: Redaction (never-tier and PII, streaming-safe)

**Files:**
- Create: `packages/twin/src/redact/redact.ts`
- Create: `packages/twin/src/redact/stream.ts`
- Create: `packages/twin/src/redact/index.ts`
- Test: `packages/twin/tests/redact/redact.test.ts`, `packages/twin/tests/redact/stream.test.ts`

- [ ] **Step 1: Failing tests**

`packages/twin/tests/redact/redact.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { REDACTED, redactText } from '../../src/redact'

const rules = { terms: ['Acme Secret Client', 'R$ 30.000'], allow: ['hello@vinicius.dev'] }

describe('redactText', () => {
  it('removes never-tier terms case-insensitively', () => {
    expect(redactText('I worked for acme secret client last year', rules)).toBe(`I worked for ${REDACTED} last year`)
  })

  it('removes emails and phone numbers that are not allow-listed', () => {
    expect(redactText('mail me at vq@private.com or hello@vinicius.dev', rules)).toBe(`mail me at ${REDACTED} or hello@vinicius.dev`)
    expect(redactText('call +55 (11) 98765-4321', rules)).toBe(`call ${REDACTED}`)
  })

  it('leaves years and ranges alone', () => {
    expect(redactText('From 2019-2024 and 2025.', rules)).toBe('From 2019-2024 and 2025.')
  })
})
```

`packages/twin/tests/redact/stream.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { REDACTED, StreamRedactor, redactText } from '../../src/redact'

const rules = { terms: ['Acme Secret Client'], allow: [] }

/** Feeds text in every possible two-way split and checks the output equals whole-text redaction. */
function everySplitMatches(text: string): void {
  const expected = redactText(text, rules)
  for (let i = 0; i <= text.length; i++) {
    const r = new StreamRedactor(rules)
    const out = r.push(text.slice(0, i)) + r.push(text.slice(i)) + r.flush()
    expect(out).toBe(expected)
  }
}

describe('StreamRedactor', () => {
  it('never leaks a term split across deltas', () => {
    everySplitMatches('Before: Acme Secret Client, after.')
    everySplitMatches('reach me on vq@private.com today')
  })

  it('emits text early once it is safely past the holdback', () => {
    const r = new StreamRedactor(rules)
    const long = 'a'.repeat(200)
    expect(r.push(long).length).toBeGreaterThan(0)
    expect(r.push('Acme Secret Client') + r.flush()).toContain(REDACTED)
  })
})
```

- [ ] **Step 2: Run them.** Expect FAIL.

- [ ] **Step 3: Implement**

`packages/twin/src/redact/redact.ts`:
```ts
/** What replaces redacted spans; visible so readers know something was withheld. */
export const REDACTED = '[redacted]'

/** Literal never-tier terms from the CMS plus public values that must not be redacted. */
export interface RedactionRules {
  terms: readonly string[]
  allow: readonly string[]
}

/** A redaction match over the raw text. */
export interface Span {
  start: number
  end: number
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu
// Ten or more digits joined only by phone punctuation: phone numbers, never years or ranges.
const PHONE = /\+?\(?\d(?:[\s().-]{0,2}\d){9,14}/g

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** All spans to redact in `text`, merged and sorted. */
export function findSpans(text: string, rules: RedactionRules): Span[] {
  const allow = new Set(rules.allow.map((a) => a.toLowerCase()))
  const spans: Span[] = []
  const collect = (re: RegExp) => {
    for (const m of text.matchAll(re)) {
      if (allow.has(m[0].toLowerCase())) continue
      spans.push({ start: m.index, end: m.index + m[0].length })
    }
  }
  const terms = rules.terms.filter((t) => t.trim().length > 0)
  if (terms.length > 0) collect(new RegExp(terms.map(escape).join('|'), 'giu'))
  collect(EMAIL)
  collect(PHONE)
  spans.sort((a, b) => a.start - b.start)
  const merged: Span[] = []
  for (const s of spans) {
    const last = merged.at(-1)
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else merged.push({ ...s })
  }
  return merged
}

/** Replaces every span with REDACTED. */
export function redactText(text: string, rules: RedactionRules): string {
  let out = ''
  let at = 0
  for (const s of findSpans(text, rules)) {
    out += text.slice(at, s.start) + REDACTED
    at = s.end
  }
  return out + text.slice(at)
}
```

`packages/twin/src/redact/stream.ts`:
```ts
import { findSpans, redactText, type RedactionRules } from './redact'

const MIN_HOLDBACK = 64

/**
 * Redacts a text stream delivered in deltas. It holds back the last K characters, where K is at
 * least the longest term, so a sensitive term split across deltas is always seen whole before
 * anything around it is emitted.
 */
export class StreamRedactor {
  private pending = ''
  private readonly holdback: number

  constructor(private readonly rules: RedactionRules) {
    this.holdback = Math.max(MIN_HOLDBACK, ...rules.terms.map((t) => t.length))
  }

  /** Adds a delta and returns the text that is now safe to emit (possibly empty). */
  push(delta: string): string {
    this.pending += delta
    let cut = this.pending.length - this.holdback
    if (cut <= 0) return ''
    // A match crossing the cut is deferred whole, so it is redacted once complete.
    for (const s of findSpans(this.pending, this.rules)) {
      if (s.start < cut && s.end > cut) cut = s.start
    }
    const ready = this.pending.slice(0, cut)
    this.pending = this.pending.slice(cut)
    return redactText(ready, this.rules)
  }

  /** Emits whatever is held back; call when the message completes. */
  flush(): string {
    const out = redactText(this.pending, this.rules)
    this.pending = ''
    return out
  }
}
```

`packages/twin/src/redact/rules.ts` (both apps fetch the same rules from the CMS endpoint built in B3):
```ts
import { z } from 'zod'
import type { RedactionRules } from './redact'

const RulesResponse = z.object({ terms: z.array(z.string()), allow: z.array(z.string()) })
const TTL_MS = 5 * 60_000

let cached: { at: number; rules: RedactionRules } | null = null

/**
 * Never-tier terms and allow-listed contact values from `GET /api/twin/redact-terms`, memoised for
 * five minutes. A failed fetch throws: redaction must never silently run without its terms.
 */
export async function fetchRedactionRules(cmsUrl: string, secret: string, now = Date.now()): Promise<RedactionRules> {
  if (cached && now - cached.at < TTL_MS) return cached.rules
  const res = await fetch(new URL('/api/twin/redact-terms', cmsUrl), {
    headers: { authorization: `Bearer ${secret}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`redact-terms responded ${res.status}`)
  const rules = RulesResponse.parse(await res.json())
  cached = { at: now, rules }
  return rules
}

/** Test seam: forget the memoised rules. */
export function resetRedactionRulesCache(): void {
  cached = null
}
```

Add `packages/twin/tests/redact/rules.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRedactionRules, resetRedactionRulesCache } from '../../src/redact'

afterEach(() => {
  vi.unstubAllGlobals()
  resetRedactionRulesCache()
})

describe('fetchRedactionRules', () => {
  it('fetches with the bearer secret and memoises', async () => {
    const fetchMock = vi.fn(async () => Response.json({ terms: ['X'], allow: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchRedactionRules('http://cms:3001', 's', 0)
    await fetchRedactionRules('http://cms:3001', 's', 1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws instead of redacting without terms', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })))
    await expect(fetchRedactionRules('http://cms:3001', 'bad', 0)).rejects.toThrow(/401/)
  })
})
```

`packages/twin/src/redact/index.ts`:
```ts
export * from './redact'
export * from './stream'
export * from './rules'
```

- [ ] **Step 4: Run the tests.** Expect PASS. If an `everySplitMatches` case fails, the bug is in the cut logic. Never weaken the test.

- [ ] **Step 5: Commit**

```bash
git add packages/twin/src/redact packages/twin/tests/redact
git commit -m "feat(twin): never-tier and PII redaction that is safe across stream deltas"
```

---

### Task A7: Phase A gate

- [ ] Run: `bun run --cwd packages/twin test && bun run --cwd packages/twin check-types && bunx prettier --check packages/twin`
- [ ] Expected: all green. Fix any formatting with `bunx prettier --write packages/twin` and commit as `style(twin): format`.
