# Owner Approvals over iMessage (Sendblue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Telegram owner-approval transport with iMessage through Sendblue. The owner gets a text with a 4-character reply code and answers `YES <code>` or `NO <code>`.

**Architecture:**
- The durable approval workflow (`request_disclosure` → `openApproval` → `notifyOwner` → webhook/sleep race → `finalizeApproval`) is unchanged.
- Only the transport moves:
  - outbound goes through the official `sendblue` SDK (`agent/lib/imessage.ts`);
  - inbound is a new `POST /webhooks/sendblue` route whose handler lives in `agent/lib/sendblue-webhook.ts`;
  - replies are parsed by a pure grammar (`agent/lib/imessage-reply.ts`);
  - approvals gain a `reply_code` and a `notified_at` (migration 0002).
- The `telegram` optional integration becomes `imessage`.

**Tech Stack:** eve 0.71, `sendblue` 3.19.0 (official SDK), Drizzle 0.45 / drizzle-kit 0.31, zod 4.5.4, vitest 5, pglite 0.5.

**Spec:** `docs/superpowers/specs/2026-10-05-imessage-owner-approvals-design.md`. Read it first.

---

## Global conventions (apply to every task)

1. **Style:**
   - Single quotes, no semicolons, 2-space indent, trailing commas.
   - Every exported symbol gets a one-line JSDoc. Comments explain *why*.
2. **TypeScript:** strict, no `any`. Use zod `.parse` at boundaries; `safeParse` only where a typed fallback is spelled out.
3. **No placeholders,** no TODOs, no commented-out code.
4. **Commits:**
   - Conventional, with a scope (`twin`, `agents`, `web`, `ci`, `docs`).
   - End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   - Never stage `apps/payload/src/app/(payload)/admin/importMap.js` or the root `package.json`.
   - Stage only the files the task lists.
5. **Never touch `apps/payload/payload.db`.**
6. **Never print secret values.**
7. **Local Postgres** is `postgres://twin:twin@127.0.0.1:5433/<db>`. Always use 127.0.0.1, never localhost.
8. **Commands run from the repo root** (`D:\Second Brain\01.PROJETOS\applications\my-portfolio`) through the Bash tool (Git Bash).

## File map

```
packages/twin/src/env.ts                         T1  imessage integration replaces telegram
packages/twin/tests/env.test.ts                  T1
packages/twin/src/db/schema.ts                   T2  reply_code, notified_at, partial unique index
packages/twin/migrations/0002_*.sql (+ meta)     T2  generated, then edited for backfill
packages/twin/src/db/queries/approvals.ts        T2  reply codes, setApprovalNotified, findApprovalByCode, listNotifiedPending
packages/twin/tests/db/queries.test.ts           T2
packages/twin/tests/db/migration-0002.test.ts    T2
apps/agents/agent/lib/phone.ts                   T3  E.164 normalisation (reference: asPhoneNumber)
apps/agents/agent/lib/imessage-reply.ts          T3  reply grammar + every owner-facing text
apps/agents/tests/imessage-reply.test.ts         T3
apps/agents/agent/lib/imessage.ts                T4  sendToOwner via sendblue SDK (replaces telegram.ts)
apps/agents/tests/imessage.test.ts               T4
apps/agents/agent/lib/owner-decision.ts          T5  replaces telegram-decision.ts
apps/agents/agent/lib/approvals.ts               T5
apps/agents/tests/owner-decision.test.ts         T5  replaces telegram-decision.test.ts
apps/agents/tests/approval-steps.test.ts         T5
apps/agents/agent/lib/webhook-utils.ts           T6  json, lostCause, bestEffort, deliver (moved)
apps/agents/agent/lib/sendblue-webhook.ts        T6  inbound handler
apps/agents/agent/channels/webhooks.ts           T6  telegram route → sendblue route
apps/agents/tests/sendblue-webhook.test.ts       T6
apps/agents/agent/lib/search.ts                  T7  gate restricted entries on 'imessage'
apps/agents/tests/integration-gating.test.ts     T7
apps/web/app/api/twin/hooks/[provider]/route.ts  T7  telegram → sendblue
apps/web/tests/unit/twin/hooks-route.test.ts     T7
apps/agents/fixtures/offline/stubs/{sendblue,start}.ts, .env.example   T8
.github/workflows/ci.yml, docker-compose.yml, .env.deploy.example, scripts/scan-client-bundle.ts  T8
apps/agents/README.md, apps/agents/.env.example, docs/deploy-easypanel.md, twin spec §8 pointer  T9
```

Deleted: `apps/agents/agent/lib/telegram.ts`, `apps/agents/agent/lib/telegram-decision.ts`, `apps/agents/tests/telegram.test.ts`, `apps/agents/tests/telegram-decision.test.ts`, `apps/agents/fixtures/offline/stubs/telegram.ts`.

---

### Task 1: `imessage` integration env

**Files:**
- Modify: `packages/twin/src/env.ts`
- Test: `packages/twin/tests/env.test.ts`

- [ ] **Step 1: Update the tests first.** In `packages/twin/tests/env.test.ts`:
  1. Replace the three `TELEGRAM_*` entries of the `agents` fixture with:
     ```ts
     SENDBLUE_API_KEY: 'sb-key',
     SENDBLUE_API_SECRET: 'sb-secret',
     SENDBLUE_FROM_NUMBER: '+15550000001',
     SENDBLUE_WEBHOOK_SECRET: 'sb_secret_value_1234',
     OWNER_PHONE_NUMBER: '+5511999998888',
     ```
  2. In the loop of `'parses without any optional integration, each reported as off'`, replace `'telegram'` with `'imessage'`.
  3. Replace the half-configured test with:
     ```ts
     it('rejects a half-configured integration, naming what is missing', () => {
       expect(() => parseEnv(agentsEnvSchema, { ...agents, OWNER_PHONE_NUMBER: '' })).toThrow(
         /OWNER_PHONE_NUMBER: required by the imessage integration because SENDBLUE_API_KEY, SENDBLUE_API_SECRET, SENDBLUE_FROM_NUMBER, SENDBLUE_WEBHOOK_SECRET is set/,
       )
     })

     it('requires E.164 phone numbers', () => {
       expect(() => parseEnv(agentsEnvSchema, { ...agents, OWNER_PHONE_NUMBER: '11 99999-8888' })).toThrow(/OWNER_PHONE_NUMBER: must be E.164/)
     })

     it('defaults the Sendblue API base', () => {
       expect(parseEnv(agentsEnvSchema, agents).SENDBLUE_API_BASE).toBe('https://api.sendblue.co')
     })
     ```

- [ ] **Step 2: Run them and see them fail.** Run `bun run --cwd packages/twin test tests/env.test.ts`. Expected: FAIL on the imessage assertions.

- [ ] **Step 3: Implement.** In `packages/twin/src/env.ts`:
  1. In `INTEGRATIONS`, replace the `telegram:` line with:
     ```ts
     imessage: ['SENDBLUE_API_KEY', 'SENDBLUE_API_SECRET', 'SENDBLUE_FROM_NUMBER', 'SENDBLUE_WEBHOOK_SECRET', 'OWNER_PHONE_NUMBER'],
     ```
  2. Above `agentsEnvObject`, add:
     ```ts
     const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, 'must be E.164, e.g. +5511999998888')
     ```
  3. Replace the `TELEGRAM_API_BASE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_OWNER_USER_ID` entries and their comments with:
     ```ts
     // Sendblue REST base; the offline evals point it at a local stub.
     SENDBLUE_API_BASE: z.url().default('https://api.sendblue.co'),
     SENDBLUE_API_KEY: z.string().min(1).optional(),
     SENDBLUE_API_SECRET: z.string().min(1).optional(),
     // The Sendblue line that texts the owner.
     SENDBLUE_FROM_NUMBER: e164.optional(),
     // Set on the Sendblue receive webhook; Sendblue sends it back in `sb-signing-secret`.
     SENDBLUE_WEBHOOK_SECRET: z.string().regex(/^[\w-]{16,256}$/).optional(),
     // The only number whose replies decide approvals.
     OWNER_PHONE_NUMBER: e164.optional(),
     ```

- [ ] **Step 4: Run.** `bun run --cwd packages/twin test tests/env.test.ts` should PASS. Then `bun run --cwd packages/twin check-types`: the env file is clean. Agents code will fail type-checking until T4 to T7; that's expected.

- [ ] **Step 5: Commit.** Don't commit yet. T1 to T7 land as one commit at the end of T7, because the agents app doesn't type-check in between. Keep going.

---

### Task 2: approvals get reply codes and `notified_at`

**Files:**
- Modify: `packages/twin/src/db/schema.ts` (the `approvals` table)
- Generate and edit: `packages/twin/migrations/0002_*.sql`, `packages/twin/migrations/meta/*`
- Modify: `packages/twin/src/db/queries/approvals.ts`
- Test: `packages/twin/tests/db/queries.test.ts`; create `packages/twin/tests/db/migration-0002.test.ts`

- [ ] **Step 1: Schema.** In `schema.ts`'s `approvals` table:
  1. Replace `telegramMessageId: bigint('telegram_message_id', { mode: 'number' }),` with:
     ```ts
     // What the owner types back ("YES K7Q2"); unique among pending approvals only.
     replyCode: text('reply_code').notNull(),
     // Set once the owner has been texted; the notify step's idempotency marker.
     notifiedAt: timestamp('notified_at', { withTimezone: true }),
     ```
  2. Add to the index list:
     ```ts
     uniqueIndex('approvals_pending_code_uq').on(t.replyCode).where(sql`${t.status} = 'pending'`),
     ```
  3. Import `sql` from `drizzle-orm` if it isn't already. Drop the `bigint` import if nothing else uses it.

- [ ] **Step 2: Generate the migration.** Run `bun run --cwd packages/twin db:generate`. Expected: a new `migrations/0002_<name>.sql` and `meta/0002_snapshot.json`, with the journal updated. Open the SQL and replace its body with the following. The backfill keeps existing local rows valid. md5 hex can contain 0 and 1, which the grammar still accepts.
  ```sql
  ALTER TABLE "twin"."approvals" ADD COLUMN "reply_code" text;--> statement-breakpoint
  UPDATE "twin"."approvals" SET "reply_code" = upper(substr(md5("id"::text), 1, 4));--> statement-breakpoint
  ALTER TABLE "twin"."approvals" ALTER COLUMN "reply_code" SET NOT NULL;--> statement-breakpoint
  ALTER TABLE "twin"."approvals" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
  UPDATE "twin"."approvals" SET "notified_at" = "requested_at" WHERE "telegram_message_id" IS NOT NULL;--> statement-breakpoint
  ALTER TABLE "twin"."approvals" DROP COLUMN "telegram_message_id";--> statement-breakpoint
  CREATE UNIQUE INDEX "approvals_pending_code_uq" ON "twin"."approvals" USING btree ("reply_code") WHERE "twin"."approvals"."status" = 'pending';
  ```
  Keep drizzle-kit's exact `WHERE` text for the index if it differs: the snapshot must match.

- [ ] **Step 3: Migration test.** Read `packages/twin/src/testing/test-db.ts` first. If it applies all migrations at once and offers no way to stop before one, run 0000 and 0001 by hand: read the SQL files, split on `--> statement-breakpoint`, and execute them on a fresh `PGlite`. Then insert a visitor, a conversation and an approval with `telegram_message_id = 5`. Then apply 0002 the same way. Create `packages/twin/tests/db/migration-0002.test.ts`:
  ```ts
  import { PGlite } from '@electric-sql/pglite'
  import { readFileSync, readdirSync } from 'node:fs'
  import { join } from 'node:path'
  import { describe, expect, it } from 'vitest'

  const dir = join(import.meta.dirname, '../../migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  async function apply(pg: PGlite, file: string) {
    for (const stmt of readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) await pg.exec(stmt)
    }
  }

  describe('migration 0002', () => {
    it('backfills reply codes and notified_at for existing approvals, then drops telegram_message_id', async () => {
      const pg = new PGlite()
      await apply(pg, files[0]!)
      await apply(pg, files[1]!)
      // Insert the minimum rows the FKs need. Read migrations/0000_*.sql for the exact required
      // columns of twin.visitors and twin.conversations, and fill every NOT NULL column without
      // a default.
      // ... inserts here, followed by:
      // INSERT INTO twin.approvals (id, session_id, source_id, topic, reason, telegram_message_id)
      //   VALUES ('00000000-0000-4000-8000-0000000000a1', <session>, 'knowledge:1', 'T', 'r', 5)
      await apply(pg, files[2]!)
      const { rows } = await pg.query<{ reply_code: string; notified_at: Date | null }>(
        'SELECT reply_code, notified_at FROM twin.approvals',
      )
      expect(rows[0]!.reply_code).toMatch(/^[0-9A-F]{4}$/)
      expect(rows[0]!.notified_at).not.toBeNull()
      const cols = await pg.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'telegram_message_id'")
      expect(cols.rows).toHaveLength(0)
      await pg.close()
    })
  })
  ```
  The implementer replaces the two commented insert lines with real `pg.exec` inserts, derived from 0000's DDL. That is the only part left to the implementer, and it is mechanical: copy the columns.

- [ ] **Step 4: Queries.** In `packages/twin/src/db/queries/approvals.ts`:
  1. Add `randomInt` from `node:crypto`, and `desc`, `gt`, `isNotNull` from `drizzle-orm`.
  2. Add:
     ```ts
     /** Reply-code alphabet: no 0/O or 1/I/L, so a code read on a phone is typed back right. */
     export const REPLY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

     /** A random 4-character reply code. */
     export function newReplyCode(): string {
       return Array.from({ length: 4 }, () => REPLY_CODE_ALPHABET[randomInt(REPLY_CODE_ALPHABET.length)]).join('')
     }

     const CODE_ATTEMPTS = 5

     /** True for a unique violation of `constraint`, whether thrown by pg or pglite, or wrapped by drizzle. */
     function violates(e: unknown, constraint: string): boolean {
       for (let err: unknown = e; err instanceof Error; err = err.cause) {
         const pgErr = err as Error & { code?: string; constraint?: string }
         if (pgErr.code === '23505' && pgErr.constraint === constraint) return true
       }
       return false
     }
     ```
  3. Change `createApproval` to take a code source and retry on code collisions:
     ```ts
     /**
      * Persists a pending owner approval once per tool call and returns its id. A retried step or a
      * re-dispatched run with the same call gets the same row. A reply code that collides with
      * another pending approval is redrawn.
      */
     export async function createApproval(
       db: TwinDb,
       a: { sessionId: string; callId: string; sourceId: string; topic: string; reason: string },
       codes: () => string = newReplyCode,
     ): Promise<string> {
       for (let attempt = 1; ; attempt++) {
         try {
           const [row] = await db
             .insert(approvals)
             .values({ ...a, replyCode: codes() })
             .onConflictDoNothing({ target: [approvals.sessionId, approvals.callId] })
             .returning({ id: approvals.id })
           if (row) return row.id
           break
         } catch (e) {
           if (!violates(e, 'approvals_pending_code_uq') || attempt >= CODE_ATTEMPTS) throw e
         }
       }
       const existing = await findSessionApproval(db, a.sessionId, { callId: a.callId })
       if (!existing) throw new Error('Approval insert conflicted but no row was found')
       return existing.id
     }
     ```
  4. Replace `setApprovalTelegramMessage` with:
     ```ts
     /** Marks the owner as texted, so a retried notify step never texts twice. */
     export async function setApprovalNotified(db: TwinDb, id: string, now = new Date()): Promise<void> {
       await db.update(approvals).set({ notifiedAt: now }).where(eq(approvals.id, id))
     }
     ```
  5. In `DecidedApproval`, replace `telegramMessageId: number | null` with `topic: string` and `replyCode: string`. In `decideApproval`'s return, set `topic: row.topic, replyCode: row.replyCode`.
  6. In `ApprovalRecord`, replace `telegramMessageId: number | null` with `replyCode: string` and `notifiedAt: Date | null`. Map both in `toRecord`.
  7. Add:
     ```ts
     const LATE_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

     /**
      * The approval a reply code refers to: the pending one, or else the most recently settled one
      * with that code from the last 24 hours (so a late reply is told what happened). Null otherwise.
      */
     export async function findApprovalByCode(db: TwinDb, code: string, now = new Date()): Promise<ApprovalRecord | null> {
       const [pending] = await db.select().from(approvals).where(and(eq(approvals.replyCode, code), eq(approvals.status, 'pending')))
       if (pending) return toRecord(pending)
       const [settled] = await db
         .select()
         .from(approvals)
         .where(and(eq(approvals.replyCode, code), ne(approvals.status, 'pending'), gt(approvals.decidedAt, new Date(now.getTime() - LATE_REPLY_WINDOW_MS))))
         .orderBy(desc(approvals.decidedAt))
         .limit(1)
       return settled ? toRecord(settled) : null
     }

     /** Pending approvals the owner has been texted about, oldest first (bare YES/NO and help texts). */
     export async function listNotifiedPending(db: TwinDb): Promise<ApprovalRecord[]> {
       const rows = await db
         .select()
         .from(approvals)
         .where(and(eq(approvals.status, 'pending'), isNotNull(approvals.notifiedAt)))
         .orderBy(asc(approvals.requestedAt))
       return rows.map(toRecord)
     }
     ```
  8. Export the new functions and constants from `packages/twin/src/db/index.ts` if that file re-exports explicitly. Check it, and keep `setApprovalTelegramMessage` out.

- [ ] **Step 5: Query tests.** In `packages/twin/tests/db/queries.test.ts`:
  1. Replace `setApprovalTelegramMessage` with `setApprovalNotified` in the imports and in the test `'keeps the newest delivery webhook while pending and stores the telegram message on its own'`. Rename that test to `'keeps the newest delivery webhook while pending and records the notification on its own'`, and assert `notifiedAt: null` before and `notifiedAt: expect.any(Date)` after.
  2. Replace every `'telegram:42'` actor with `'imessage:owner'`, and `'Approved via Telegram'` with `'Approved via iMessage'`.
  3. Add, inside the approvals `describe`, reusing the existing helpers that create a session (copy the setup the neighbouring approval tests use):
     ```ts
     it('assigns a reply code from the alphabet and redraws on a pending collision', async () => {
       const codes = ['AAAA', 'AAAA', 'BBBB']
       const first = await createApproval(t.db, { ...base, callId: 'c1' }, () => codes.shift()!)
       const second = await createApproval(t.db, { ...base, callId: 'c2', sourceId: 'knowledge:9' }, () => codes.shift()!)
       expect((await getApproval(t.db, first))!.replyCode).toBe('AAAA')
       expect((await getApproval(t.db, second))!.replyCode).toBe('BBBB')
       expect(newReplyCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/)
     })

     it('reuses a code once its approval is settled', async () => {
       const first = await createApproval(t.db, { ...base, callId: 'c1' }, () => 'CCCC')
       await decideApproval(t.db, first, { status: 'denied', actor: 'imessage:owner', reasoning: 'no' })
       const second = await createApproval(t.db, { ...base, callId: 'c2', sourceId: 'knowledge:9' }, () => 'CCCC')
       expect((await findApprovalByCode(t.db, 'CCCC'))!.id).toBe(second)
     })

     it('finds a recently settled approval by code for late replies, but not an old one', async () => {
       const id = await createApproval(t.db, { ...base, callId: 'c1' }, () => 'DDDD')
       await decideApproval(t.db, id, { status: 'expired', actor: 'system', reasoning: 'x' }, new Date('2026-10-05T10:00:00Z'))
       expect((await findApprovalByCode(t.db, 'DDDD', new Date('2026-10-05T12:00:00Z')))!.status).toBe('expired')
       expect(await findApprovalByCode(t.db, 'DDDD', new Date('2026-10-07T12:00:00Z'))).toBeNull()
       expect(await findApprovalByCode(t.db, 'ZZZZ')).toBeNull()
     })

     it('lists only notified pending approvals, oldest first', async () => {
       const a = await createApproval(t.db, { ...base, callId: 'c1' })
       const b = await createApproval(t.db, { ...base, callId: 'c2', sourceId: 'knowledge:9' })
       await createApproval(t.db, { ...base, callId: 'c3', sourceId: 'knowledge:10' })
       await setApprovalNotified(t.db, b)
       await setApprovalNotified(t.db, a)
       expect((await listNotifiedPending(t.db)).map((r) => r.id)).toEqual([a, b])
     })
     ```
     `base` is `{ sessionId, sourceId: 'knowledge:5', topic: 'Notice period', reason: 'asked' }`, using the session the suite's `beforeEach` creates. Adapt the name if the file already defines an equivalent.

- [ ] **Step 6: Run.** `bun run --cwd packages/twin test` should be all PASS, and `bun run --cwd packages/twin check-types` clean.

---

### Task 3: phone normalisation and reply grammar (pure)

**Files:**
- Create: `apps/agents/agent/lib/phone.ts`, `apps/agents/agent/lib/imessage-reply.ts`
- Test: `apps/agents/tests/imessage-reply.test.ts`

- [ ] **Step 1: Failing tests.** Create `apps/agents/tests/imessage-reply.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest'
  import { confirmationText, helpText, lateReplyText, parseOwnerReply, requestText, unknownCodeText } from '../agent/lib/imessage-reply'
  import { toE164 } from '../agent/lib/phone'

  describe('toE164', () => {
    it('normalises handles to E.164 and rejects Apple IDs and junk', () => {
      expect(toE164('+55 (11) 99999-8888')).toBe('+5511999998888')
      expect(toE164('15550000001')).toBe('+15550000001')
      expect(toE164('owner@icloud.com')).toBeNull()
      expect(toE164('+0123')).toBeNull()
    })
  })

  describe('parseOwnerReply', () => {
    it.each([
      ['YES K7Q2', 'approved', 'K7Q2'],
      ['yes k7q2', 'approved', 'K7Q2'],
      ['  Approve  K7Q2. ', 'approved', 'K7Q2'],
      ['ok k7q2!', 'approved', 'K7Q2'],
      ['y K7Q2', 'approved', 'K7Q2'],
      ['NO K7Q2', 'denied', 'K7Q2'],
      ['deny k7q2', 'denied', 'K7Q2'],
      ['n K7Q2', 'denied', 'K7Q2'],
      ['yes', 'approved', null],
      ['No.', 'denied', null],
    ])('%s', (text, status, code) => {
      expect(parseOwnerReply(text)).toEqual({ kind: 'decision', status, code })
    })

    it.each(['', 'maybe', 'yes K7Q', 'yes K7Q2 please', 'K7Q2', 'yes yes', '👍'])('rejects %j', (text) => {
      expect(parseOwnerReply(text)).toEqual({ kind: 'unrecognised' })
    })
  })

  describe('owner texts', () => {
    it('builds the request from the row only, with the code and the deadline', () => {
      expect(requestText({ topic: 'Notice period', sourceId: 'knowledge:5', replyCode: 'K7Q2' }, '15m')).toBe(
        'Twin approval request\nTopic: Notice period\nItem: knowledge:5\nReply YES K7Q2 to share or NO K7Q2 to decline. Auto-denies after 15m.',
      )
    })

    it('confirms decisions and explains late or unknown replies', () => {
      expect(confirmationText('approved', 'K7Q2', 'Notice period')).toBe('Approved K7Q2: Notice period.')
      expect(confirmationText('denied', 'K7Q2', 'Notice period')).toBe('Denied K7Q2: Notice period. Nothing was shared.')
      expect(lateReplyText('expired', 'K7Q2')).toBe('K7Q2 already expired; nothing was shared.')
      expect(lateReplyText('approved', 'K7Q2')).toBe('K7Q2 was already approved.')
      expect(unknownCodeText('ZZZZ')).toBe('No approval ZZZZ is waiting.')
    })

    it('lists pending codes in the help text, at most three', () => {
      expect(helpText([])).toBe('Nothing is waiting for approval.')
      const four = ['A', 'B', 'C', 'D'].map((c) => ({ replyCode: `${c}${c}${c}${c}`, topic: `T${c}` }))
      expect(helpText(four)).toBe('Reply YES <code> or NO <code>. Waiting: AAAA (TA), BBBB (TB), CCCC (TC), and 1 more.')
    })
  })
  ```

- [ ] **Step 2: Run** `bun run --cwd apps/agents test tests/imessage-reply.test.ts`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** `apps/agents/agent/lib/phone.ts`:
  ```ts
  /**
   * A handle as E.164, or null. iMessage handles are phone numbers or Apple IDs, and only the
   * former can identify the owner (same rule as the personal-agent-template's iMessage channel).
   */
  export function toE164(handle: string): string | null {
    const trimmed = handle.trim()
    const normalized = trimmed.startsWith('+') ? `+${trimmed.slice(1).replace(/\D/g, '')}` : `+${trimmed.replace(/\D/g, '')}`
    return /^\+[1-9]\d{7,14}$/.test(normalized) && !/[a-z@]/i.test(trimmed) ? normalized : null
  }
  ```
  And `apps/agents/agent/lib/imessage-reply.ts`:
  ```ts
  /** An owner text, parsed: a decision (with or without a code) or anything else. */
  export type OwnerReply =
    | { kind: 'decision'; status: 'approved' | 'denied'; code: string | null }
    | { kind: 'unrecognised' }

  const APPROVE = new Set(['YES', 'Y', 'APPROVE', 'OK'])
  const DENY = new Set(['NO', 'N', 'DENY'])

  /**
   * Strict, deterministic grammar: `<verb>` or `<verb> <code>`. No model reads owner texts, so
   * nothing the owner (or a spoofed sender) types can be interpreted beyond these forms.
   */
  export function parseOwnerReply(text: string): OwnerReply {
    const words = text.trim().toUpperCase().replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean)
    const [verb, code, ...rest] = words
    if (!verb || rest.length > 0) return { kind: 'unrecognised' }
    const status = APPROVE.has(verb) ? 'approved' : DENY.has(verb) ? 'denied' : null
    if (!status) return { kind: 'unrecognised' }
    if (code === undefined) return { kind: 'decision', status, code: null }
    return /^[A-Z0-9]{4}$/.test(code) ? { kind: 'decision', status, code } : { kind: 'unrecognised' }
  }

  /** The approval prompt, built from the stored row only (never the model's reason; spec §8). */
  export function requestText(row: { topic: string; sourceId: string; replyCode: string }, timeout: string): string {
    return `Twin approval request\nTopic: ${row.topic}\nItem: ${row.sourceId}\nReply YES ${row.replyCode} to share or NO ${row.replyCode} to decline. Auto-denies after ${timeout}.`
  }

  /** The reply to a decision that was just recorded (or redelivered). */
  export function confirmationText(status: 'approved' | 'denied' | 'expired', code: string, topic: string): string {
    if (status === 'approved') return `Approved ${code}: ${topic}.`
    if (status === 'denied') return `Denied ${code}: ${topic}. Nothing was shared.`
    return lateReplyText('expired', code)
  }

  /** The reply when the code was already settled some other way. */
  export function lateReplyText(status: 'approved' | 'denied' | 'expired', code: string): string {
    return status === 'expired' ? `${code} already expired; nothing was shared.` : `${code} was already ${status}.`
  }

  /** The reply to a code that matches nothing. */
  export function unknownCodeText(code: string): string {
    return `No approval ${code} is waiting.`
  }

  /** The reply to anything unparseable or ambiguous, listing what is waiting. */
  export function helpText(pending: readonly { replyCode: string; topic: string }[]): string {
    if (pending.length === 0) return 'Nothing is waiting for approval.'
    const shown = pending.slice(0, 3).map((p) => `${p.replyCode} (${p.topic})`).join(', ')
    const more = pending.length > 3 ? `, and ${pending.length - 3} more` : ''
    return `Reply YES <code> or NO <code>. Waiting: ${shown}${more}.`
  }
  ```

- [ ] **Step 4: Run.** `bun run --cwd apps/agents test tests/imessage-reply.test.ts` should PASS.

---

### Task 4: outbound Sendblue client

**Files:**
- Modify: `apps/agents/package.json` (dependency)
- Create: `apps/agents/agent/lib/imessage.ts`
- Delete: `apps/agents/agent/lib/telegram.ts`, `apps/agents/tests/telegram.test.ts`
- Test: `apps/agents/tests/imessage.test.ts`

- [ ] **Step 1: Add the dependency, pinned.** Run `bun add --cwd apps/agents --exact sendblue@3.19.0`. Check that `apps/agents/package.json` has `"sendblue": "3.19.0"`.

- [ ] **Step 2: Failing test.** Create `apps/agents/tests/imessage.test.ts`:
  ```ts
  import { APIConnectionTimeoutError, APIError } from 'sendblue'
  import { FatalError } from 'workflow'
  import { beforeEach, describe, expect, it, vi } from 'vitest'

  const m = vi.hoisted(() => ({ send: vi.fn(), options: [] as unknown[] }))
  vi.mock('sendblue', async (importOriginal) => {
    const actual = await importOriginal<typeof import('sendblue')>()
    class FakeClient {
      messages = { send: m.send }
      constructor(opts: unknown) {
        m.options.push(opts)
      }
    }
    return { ...actual, default: FakeClient }
  })
  vi.mock('../agent/lib/env', () => ({
    getEnv: () => ({
      SENDBLUE_API_BASE: 'https://sb.test',
      SENDBLUE_API_KEY: 'key',
      SENDBLUE_API_SECRET: 'secret',
      SENDBLUE_FROM_NUMBER: '+15550000001',
      SENDBLUE_WEBHOOK_SECRET: 'sb_secret_value_1234',
      OWNER_PHONE_NUMBER: '+5511999998888',
    }),
  }))

  const { sendToOwner } = await import('../agent/lib/imessage')

  beforeEach(() => {
    m.send.mockReset()
    m.options.length = 0
  })

  describe('sendToOwner', () => {
    it('texts the owner from the Sendblue line with SDK retries off and a timeout', async () => {
      m.send.mockResolvedValue({ status: 'QUEUED', message_handle: 'h-1' })
      expect(await sendToOwner('hello')).toBe('h-1')
      expect(m.send).toHaveBeenCalledWith({ number: '+5511999998888', from_number: '+15550000001', content: 'hello' })
      expect(m.options[0]).toMatchObject({ apiKey: 'key', apiSecret: 'secret', baseURL: 'https://sb.test', maxRetries: 0, timeout: 10_000 })
    })

    it.each([400, 401, 403, 404])('fails permanently on HTTP %i', async (status) => {
      m.send.mockRejectedValue(APIError.generate(status, { error_message: 'nope' }, 'nope', new Headers()))
      const err = await sendToOwner('x').catch((e: unknown) => e)
      expect(FatalError.is(err)).toBe(true)
      expect(String(err)).toContain(`HTTP ${status}`)
    })

    it('keeps rate limits, server errors and timeouts retryable', async () => {
      for (const e of [
        APIError.generate(429, {}, 'slow down', new Headers()),
        APIError.generate(502, {}, 'bad gateway', new Headers()),
        new APIConnectionTimeoutError(),
      ]) {
        m.send.mockRejectedValueOnce(e)
        const err = await sendToOwner('x').catch((x: unknown) => x)
        expect(err).toBeInstanceOf(Error)
        expect(FatalError.is(err)).toBe(false)
      }
    })

    it('treats a body with status ERROR as a permanent refusal', async () => {
      m.send.mockResolvedValue({ status: 'ERROR', error_message: 'not an iMessage number' })
      const err = await sendToOwner('x').catch((e: unknown) => e)
      expect(FatalError.is(err)).toBe(true)
      expect(String(err)).toContain('not an iMessage number')
    })

    it('never puts credentials in error messages', async () => {
      m.send.mockRejectedValue(APIError.generate(401, { error_message: 'bad key' }, 'bad key', new Headers()))
      const err = String(await sendToOwner('x').catch((e: unknown) => e))
      expect(err).not.toContain('secret')
      expect(err).not.toContain('key ')
    })
  })
  ```
  If `APIError.generate` with status 400 to 404 returns subclasses (it does: `BadRequestError` and so on), `instanceof APIError` still holds.

- [ ] **Step 3: Run** `bun run --cwd apps/agents test tests/imessage.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement** `apps/agents/agent/lib/imessage.ts`:
  ```ts
  import { requireIntegration } from '@repo/twin/env'
  import SendblueAPI, { APIConnectionTimeoutError, APIError } from 'sendblue'
  import { FatalError } from 'workflow'
  import { getEnv } from './env'

  const SEND_TIMEOUT_MS = 10_000
  /** Client errors Sendblue will always repeat: bad request, bad credentials, refused or unknown number. */
  const PERMANENT = new Set([400, 401, 403, 404])

  /**
   * Texts the owner from the Sendblue line and returns Sendblue's message handle. SDK retries are
   * off: the calling workflow step owns retries. Permanent failures throw `FatalError` so the step
   * doesn't retry them; 429, 5xx, timeouts and network errors stay retryable. Error messages carry
   * the status and Sendblue's own message only, never credentials.
   */
  export async function sendToOwner(text: string): Promise<string | null> {
    const env = getEnv()
    const im = requireIntegration(env, 'imessage')
    const client = new SendblueAPI({
      apiKey: im.SENDBLUE_API_KEY,
      apiSecret: im.SENDBLUE_API_SECRET,
      baseURL: env.SENDBLUE_API_BASE,
      maxRetries: 0,
      timeout: SEND_TIMEOUT_MS,
    })
    let res: Awaited<ReturnType<typeof client.messages.send>>
    try {
      res = await client.messages.send({ number: im.OWNER_PHONE_NUMBER, from_number: im.SENDBLUE_FROM_NUMBER, content: text })
    } catch (e) {
      if (e instanceof APIConnectionTimeoutError) throw new Error('Sendblue send timed out')
      if (e instanceof APIError && typeof e.status === 'number') {
        const detail = (e.error as { error_message?: unknown } | undefined)?.error_message
        const message = `Sendblue send failed: HTTP ${e.status}${typeof detail === 'string' ? ` ${detail}` : ''}`
        throw PERMANENT.has(e.status) ? new FatalError(message) : new Error(message)
      }
      throw new Error('Sendblue send request failed')
    }
    if (res.status === 'ERROR') throw new FatalError(`Sendblue refused the message: ${res.error_message ?? 'no reason given'}`)
    return res.message_handle ?? null
  }
  ```

- [ ] **Step 5: Delete the Telegram client.** Run `git rm apps/agents/agent/lib/telegram.ts apps/agents/tests/telegram.test.ts`.

- [ ] **Step 6: Run.** `bun run --cwd apps/agents test tests/imessage.test.ts` should PASS.

---

### Task 5: approval steps and decision planning on iMessage

**Files:**
- Create: `apps/agents/agent/lib/owner-decision.ts` (from `telegram-decision.ts`)
- Delete: `apps/agents/agent/lib/telegram-decision.ts`, `apps/agents/tests/telegram-decision.test.ts`
- Modify: `apps/agents/agent/lib/approvals.ts`
- Test: create `apps/agents/tests/owner-decision.test.ts`; modify `apps/agents/tests/approval-steps.test.ts`, `apps/agents/tests/stale-approvals.test.ts`

- [ ] **Step 1: Read** `apps/agents/tests/telegram-decision.test.ts`. Its cases carry over.

- [ ] **Step 2: Create `apps/agents/agent/lib/owner-decision.ts`:**
  ```ts
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
   * returned; `stored` is the row read back when it returned null (already settled).
   *
   * A settled row carrying this very decision by the owner is a redelivery (or a repeated reply)
   * after a failed delivery, so it is delivered again: a resolved workflow hook ignores extra
   * POSTs. Anything else already settled (the deadline won, or the opposite answer) is left alone.
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
  ```
  Port `telegram-decision.test.ts` to `owner-decision.test.ts`:
  - same cases;
  - `tap` becomes the `status` argument;
  - `answer` and `markText` assertions become `reply` assertions with the texts from T3;
  - fixtures carry `topic`, `replyCode` and `notifiedAt`, with no `telegramMessageId`;
  - the actor is `OWNER_ACTOR`;
  - add a case: `stored.status === 'expired'` gives the reply `'<code> already expired; nothing was shared.'` and `deliverTo: null`.

  Then delete the old files: `git rm apps/agents/agent/lib/telegram-decision.ts apps/agents/tests/telegram-decision.test.ts`.

- [ ] **Step 3: `approvals.ts`.**
  1. Replace `import { markDecided, sendApprovalRequest } from './telegram'` with `import { sendToOwner } from './imessage'` and `import { requestText } from './imessage-reply'`.
  2. Replace `setApprovalTelegramMessage` with `setApprovalNotified` in the `@repo/twin/db` import.
  3. Replace `notifyOwner`'s body after `if (!row) …` with:
     ```ts
     if (row.notifiedAt !== null || row.status !== 'pending') return
     await sendToOwner(requestText(row, getEnv().TWIN_APPROVAL_TIMEOUT))
     await setApprovalNotified(db(), approvalId)
     ```
     Rewrite its JSDoc: "Step: text the owner the approval request with its reply code. `notified_at` marks the owner as notified, so a retried step or a reused approval never texts twice. The text comes from the row only…". Keep the existing paragraph about leaving out the model's `reason`.
  4. In `finalizeApproval`, delete the whole "Best effort … markDecided … Telegram" block. The prompt already states the deadline, and a late reply is answered by the route.
  5. Update the `createApproval`/`openApproval` comments that mention Telegram ("the Telegram callback payload") so they mention neither Telegram nor callbacks.

- [ ] **Step 4: `approval-steps.test.ts`.**
  1. Mock `'../agent/lib/imessage'` with `{ sendToOwner: m.sendToOwner }`, where `m.sendToOwner = vi.fn(async () => 'h-1')`, instead of `'../agent/lib/telegram'`. Drop `markDecided` and `sendApprovalRequest` from `m`.
  2. Replace `setApprovalTelegramMessage(t.db, id, 501)` with `setApprovalNotified(t.db, id)`.
  3. Replace `telegramMessageId: null` and `telegramMessageId: 501` expectations with `notifiedAt: null` and `notifiedAt: expect.any(Date)`.
  4. Assert the notify test sends `requestText` output: `expect(m.sendToOwner).toHaveBeenCalledWith(expect.stringMatching(/^Twin approval request\nTopic: CMS topic 5\nItem: knowledge:5\nReply YES [A-Z0-9]{4} to share/))`.
  5. Delete the tests that covered `markDecided` on expiry, and replace them with one test: an expired approval with `notifiedAt` set settles as `expired` and calls `sendToOwner` zero times.
  6. Replace `'telegram:42'` with `'imessage:owner'` everywhere, and in `stale-approvals.test.ts` too.

- [ ] **Step 5: Run** `bun run --cwd apps/agents test tests/owner-decision.test.ts tests/approval-steps.test.ts tests/stale-approvals.test.ts tests/request-disclosure-body.test.ts`. All should PASS. In `request-disclosure-body.test.ts`, only the string `'telegram down'` changes, to `'sendblue down'`. The `not.toMatch(/…telegram/i)` stays as written: it guards that no transport name leaks to the model. Add `imessage|sendblue` to that regex.

---

### Task 6: inbound `POST /webhooks/sendblue`

**Files:**
- Create: `apps/agents/agent/lib/webhook-utils.ts`, `apps/agents/agent/lib/sendblue-webhook.ts`
- Modify: `apps/agents/agent/channels/webhooks.ts`
- Test: create `apps/agents/tests/sendblue-webhook.test.ts`; check that `apps/agents/tests/cal-handler.test.ts` still passes

- [ ] **Step 1: Move the shared helpers.** Move `reason`, `json`, `lostCause`, `bestEffort` and `deliver` from `webhooks.ts` into `apps/agents/agent/lib/webhook-utils.ts`, unchanged except:
  - export each one, each with a one-line JSDoc;
  - `bestEffort`'s log prefix becomes `[webhooks] ${what} failed: …`, where `what` now includes the provider, e.g. `'sendblue reply'`;
  - `deliver` imports `deliveryOutcome` from `./owner-decision`.

  Agent `lib/` files are not channels: eve only treats `agent/channels/*` as channels. `webhooks.ts` imports them from `../lib/webhook-utils`.

- [ ] **Step 2: Failing handler test.** Create `apps/agents/tests/sendblue-webhook.test.ts`. Mock:
  - `../agent/lib/env` → `getEnv` returning the full imessage group from T4's test (`OWNER_PHONE_NUMBER: '+5511999998888'`), switchable to `{}` per test;
  - `../agent/lib/db` → `db: () => ({})`;
  - `../agent/lib/imessage` → `sendToOwner: m.send`;
  - `@repo/twin/db` → `findApprovalByCode`, `listNotifiedPending`, `decideApproval`, `getApproval` as `vi.fn()`;
  - `../agent/lib/webhook-utils`, partially (`importOriginal`), with `deliver: m.deliver`.

  Helper:
  ```ts
  const SECRET = 'sb_secret_value_1234'
  const req = (body: unknown, secret: string | null = SECRET) =>
    new Request('http://agents/webhooks/sendblue', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(secret ? { 'sb-signing-secret': secret } : {}) },
      body: JSON.stringify(body),
    })
  const inbound = (content: string, from = '+5511999998888') => ({
    content, from_number: from, to_number: '+15550000001', is_outbound: false, status: 'RECEIVED', message_handle: 'h-in', service: 'iMessage',
  })
  const pending = { id: 'ap-1', sessionId: 's1', sourceId: 'knowledge:5', topic: 'Notice period', status: 'pending', webhookUrl: 'https://hook', replyCode: 'K7Q2', notifiedAt: new Date(), decidedAt: null, actor: null }
  ```
  Cases. The handler is `handleSendblueWebhook(request)` from `../agent/lib/sendblue-webhook`:
  1. **Integration off** (`getEnv` → `{}`) → 404, and nothing is called.
  2. **Wrong or missing secret** → 401.
  3. **A body that isn't the inbound shape** (`{ hello: 1 }`) → 200, and no database call.
  4. **`is_outbound: true`**, **`status: 'SENT'`** and **`group_id: 'g1'`** → 200, with no database call and no send.
  5. **Another sender** (`'+15551112222'`) → 200, no database call, no send. Also `'owner@icloud.com'` → the same.
  6. **The owner's number in another format** (`'+55 11 99999-8888'`) is accepted.
  7. **`'YES K7Q2'`** → `findApprovalByCode('K7Q2')` returns `pending`, and `decideApproval` returns `{ ...pending, status: 'approved', decidedAt: new Date() }`. Then `decideApproval` is called with `('ap-1', { status: 'approved', actor: 'imessage:owner', reasoning: 'Approved via iMessage' })`, `deliver` is called with `('https://hook', 'ap-1', 'approved')`, and the owner is sent `'Approved K7Q2: Notice period.'`.
  8. **`'no k7q2'`** → denied, and the owner is sent `'Denied K7Q2: Notice period. Nothing was shared.'`.
  9. **A late reply.** `decideApproval` returns null and `getApproval` returns `{ ...pending, status: 'expired', actor: 'system' }`. Then nothing is delivered, and the owner is sent `'K7Q2 already expired; nothing was shared.'`.
  10. **An unknown code.** `findApprovalByCode` returns null, and the owner is sent `'No approval ZZZZ is waiting.'`.
  11. **Bare `'yes'` with exactly one notified pending** → it decides that one.
  12. **Bare `'yes'` with two pending** → no decision, and the owner is sent the `helpText` listing both.
  13. **`'maybe'`** → the owner is sent `helpText(pending list)`, and nothing is decided.
  14. **A failing send** (`m.send` rejects) → still 200, and the decision is still committed.
  15. **`decideApproval` throws** (database down) → the handler rejects. eve turns that into a 500, and Sendblue retries on 5xx. Assert with `await expect(handleSendblueWebhook(req(inbound('YES K7Q2')))).rejects.toThrow()`.

- [ ] **Step 3: Run** `bun run --cwd apps/agents test tests/sendblue-webhook.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement** `apps/agents/agent/lib/sendblue-webhook.ts`:
  ```ts
  import { decideApproval, findApprovalByCode, getApproval, listNotifiedPending, type ApprovalRecord } from '@repo/twin/db'
  import { integrationConfig } from '@repo/twin/env'
  import { z } from 'zod'
  import { db } from './db'
  import { getEnv } from './env'
  import { sendToOwner } from './imessage'
  import { helpText, parseOwnerReply, unknownCodeText } from './imessage-reply'
  import { OWNER_ACTOR, planDecision } from './owner-decision'
  import { toE164 } from './phone'
  import { secretsEqual } from './secrets'
  import { bestEffort, deliver, json, lostCause } from './webhook-utils'

  /** The subset of a Sendblue receive webhook the twin reads (docs: Webhooks > receive). */
  const SendblueInbound = z.object({
    content: z.string().nullish(),
    from_number: z.string(),
    is_outbound: z.boolean(),
    status: z.string(),
    message_handle: z.string(),
    group_id: z.string().nullish(),
  })

  const ok = () => new Response('ok')
  const reply = (text: string) => bestEffort('sendblue reply', async () => void (await sendToOwner(text)))

  /**
   * The owner's iMessage replies to approval requests, forwarded by the web app. Verifies the
   * shared `sb-signing-secret`, accepts only the owner's number, and parses the text with a strict
   * grammar (no model reads it). Strangers are never answered: a reply costs money and confirms
   * the line is live. Unusable events are acknowledged (2xx), since Sendblue retries only on 5xx; a
   * database failure throws, so Sendblue redelivers.
   */
  export async function handleSendblueWebhook(request: Request): Promise<Response> {
    const im = integrationConfig(getEnv(), 'imessage')
    if (!im) return new Response('not found', { status: 404 })
    if (!secretsEqual(request.headers.get('sb-signing-secret'), im.SENDBLUE_WEBHOOK_SECRET))
      return new Response('unauthorized', { status: 401 })
    const parsed = SendblueInbound.safeParse(json(await request.text()))
    if (!parsed.success)
      return lostCause(`sendblue event with an unexpected shape (${parsed.error.issues.map((i) => i.path.map(String).join('.') || '(root)').join(', ')})`)
    const msg = parsed.data
    if (msg.is_outbound || msg.status !== 'RECEIVED' || msg.group_id) return ok()
    if (toE164(msg.from_number) !== im.OWNER_PHONE_NUMBER) {
      console.warn('[webhooks] sendblue message from a number other than the owner; ignored')
      return ok()
    }
    const answer = parseOwnerReply(msg.content ?? '')
    if (answer.kind === 'unrecognised') {
      await reply(helpText(await listNotifiedPending(db())))
      return ok()
    }
    let target: ApprovalRecord | null
    if (answer.code) {
      target = await findApprovalByCode(db(), answer.code)
      if (!target) {
        await reply(unknownCodeText(answer.code))
        return ok()
      }
    } else {
      const waiting = await listNotifiedPending(db())
      if (waiting.length !== 1) {
        await reply(helpText(waiting))
        return ok()
      }
      target = waiting[0]!
    }
    // Commit first: the workflow settles from the database, so a decision is never lost even if
    // everything below fails.
    const decided = await decideApproval(db(), target.id, {
      status: answer.status,
      actor: OWNER_ACTOR,
      reasoning: `${answer.status === 'approved' ? 'Approved' : 'Denied'} via iMessage`,
    })
    const plan = planDecision(answer.status, decided, decided ? null : await getApproval(db(), target.id))
    if (plan.error) console.error(`[webhooks] ${plan.error}`)
    if (plan.deliverTo) await deliver(plan.deliverTo, target.id, answer.status)
    await reply(plan.reply)
    return ok()
  }
  ```
  Then, in `apps/agents/agent/channels/webhooks.ts`:
  1. Delete the Telegram imports (`telegram`, `telegram-decision`) and the `POST('/webhooks/telegram', …)` route.
  2. Add `POST('/webhooks/sendblue', (request) => handleSendblueWebhook(request)),`.
  3. Import the helpers from `../lib/webhook-utils`.
  4. Remove now-unused imports (`decideApproval`, `getApproval`, `secretsEqual` if only Telegram used it).
  5. Update the channel JSDoc.

  `notConfigured` stays for the Cal route.

- [ ] **Step 5: Run** `bun run --cwd apps/agents test tests/sendblue-webhook.test.ts tests/cal-handler.test.ts`. Both should PASS. In `cal-handler.test.ts`, remove the `vi.mock('../agent/lib/telegram', …)` block, and the `TELEGRAM_*` keys from its env mock.

---

### Task 7: search gating, web forwarder, and the T1–T7 commit

**Files:**
- Modify: `apps/agents/agent/lib/search.ts`, `apps/agents/tests/integration-gating.test.ts`
- Modify: `apps/web/app/api/twin/hooks/[provider]/route.ts`, `apps/web/tests/unit/twin/hooks-route.test.ts`

- [ ] **Step 1: Search.** In `search.ts`:
  1. Replace `integrationConfig(getEnv(), 'telegram')` with `integrationConfig(getEnv(), 'imessage')`.
  2. Update its JSDoc: "Without iMessage there is no owner to approve…".
  3. In `integration-gating.test.ts`, change the `telegram` fixture to the imessage group (the five variables from T4's mock), and rename the test `'keeps restricted entries when iMessage is configured'`.

- [ ] **Step 2: Web forwarder.** In `route.ts`, replace `telegram: ['content-type', 'x-telegram-bot-api-secret-token'],` with `sendblue: ['content-type', 'sb-signing-secret'],`. Replace the provider check with `if (!Object.hasOwn(PROVIDERS, provider)) return new Response('not found', { status: 404 })`, then narrow with `const names = PROVIDERS[provider as keyof typeof PROVIDERS]`. Update the JSDoc (Cal.com and Sendblue). In `hooks-route.test.ts`:
  - port every telegram case to sendblue, with header `sb-signing-secret`;
  - add `'telegram'` as a 404 case;
  - keep the test that no other header (cookie, authorization) is forwarded.

- [ ] **Step 3: Full verification.** Run:
  - `bun run --cwd packages/twin test`;
  - `bun run --cwd packages/twin check-types`;
  - `bun run --cwd apps/agents test`;
  - `bun run --cwd apps/agents check-types`;
  - `bun run --cwd apps/web test`;
  - `bun run --cwd apps/web check-types`.

  All must be green. Also run `git grep -n -i telegram -- apps/agents/agent apps/agents/tests packages/twin/src apps/web/app apps/web/lib`, which must print nothing.

- [ ] **Step 4: Commit T1–T7.**
  ```bash
  git add packages/twin apps/agents/agent apps/agents/tests apps/agents/package.json apps/web/app/api/twin/hooks apps/web/tests/unit/twin/hooks-route.test.ts bun.lock
  git commit -m "feat(agents): owner approvals over iMessage via Sendblue instead of Telegram

  The owner gets a text with a reply code and answers YES/NO <code>; replies are
  parsed by a strict grammar and accepted only from OWNER_PHONE_NUMBER. Approvals
  gain reply_code and notified_at (migration 0002); the telegram integration
  becomes imessage.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
  Check `git status` first: `bun.lock` is at the repo root. Stage it only if T4 changed it.

---

### Task 8: fixtures, CI, compose, deploy env, bundle scan

**Files:**
- Create: `apps/agents/fixtures/offline/stubs/sendblue.ts`; delete `apps/agents/fixtures/offline/stubs/telegram.ts`
- Modify: `apps/agents/fixtures/offline/stubs/start.ts`, `apps/agents/fixtures/offline/.env.example`
- Modify: `.github/workflows/ci.yml`, `docker-compose.yml`, `.env.deploy.example`, `scripts/scan-client-bundle.ts` (and its test if it lists names)

- [ ] **Step 1: The stub.** Create `apps/agents/fixtures/offline/stubs/sendblue.ts`:
  ```ts
  import { createServer, type Server } from 'node:http'

  /** Every message the twin texted the owner, for assertions; nobody ever replies. */
  export const sendblueMessages: unknown[] = []

  /** A local stand-in for Sendblue's `POST /api/send-message`; always queues. */
  export function startSendblueStub(port: number): Promise<Server> {
    const server = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        sendblueMessages.push(raw ? JSON.parse(raw) : null)
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ status: 'QUEUED', message_handle: `stub-${sendblueMessages.length}` }))
      })
    })
    return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
  }
  ```
  In `start.ts`, swap `startTelegramStub(4312)` for `startSendblueStub(4312)` and update the import. Then `git rm apps/agents/fixtures/offline/stubs/telegram.ts`. In `fixtures/offline/.env.example`, replace the four `TELEGRAM_*` lines with:
  ```
  SENDBLUE_API_BASE=http://127.0.0.1:4312
  SENDBLUE_API_KEY=offline
  SENDBLUE_API_SECRET=offline
  SENDBLUE_FROM_NUMBER=+15550000001
  SENDBLUE_WEBHOOK_SECRET=offline_secret_value
  OWNER_PHONE_NUMBER=+15550000002
  ```
  Run `git grep -n -i "telegram" -- apps/agents/fixtures apps/agents/evals` and fix any remaining hits the same way. If a local `fixtures/offline/.env` exists (it is gitignored), apply the same swap there and say so in the report. Never print it.

- [ ] **Step 2: CI.** In `.github/workflows/ci.yml`:
  1. Remove `TELEGRAM_WEBHOOK_SECRET` (around line 59) wherever it is set.
  2. Remove the `TELEGRAM_API_BASE`, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OWNER_USER_ID` lines.
  3. Remove `TELEGRAM_WEBHOOK_SECRET` from the generated-secrets loop.
  4. Update the comment: "Google is stubbed; iMessage is left unconfigured (it is optional), so restricted entries are never offered and no approval runs."
  5. If the offline eval job sets the Telegram env, switch it to the Sendblue values from Step 1.

- [ ] **Step 3: Compose.** In `docker-compose.yml`'s `agents` environment:
  1. Every optional-integration variable becomes `${VAR:-}`: the Google pair, `CAL_LINK`, `CAL_WEBHOOK_SECRET`, `TWIN_BOOKING_REF_SECRET` and `EXA_API_KEY`. They are optional since commit 73af958, and `:?` wrongly made them mandatory.
  2. Replace the four `TELEGRAM_*` lines with:
     ```yaml
     SENDBLUE_API_BASE: ${SENDBLUE_API_BASE:-}
     SENDBLUE_API_KEY: ${SENDBLUE_API_KEY:-}
     SENDBLUE_API_SECRET: ${SENDBLUE_API_SECRET:-}
     SENDBLUE_FROM_NUMBER: ${SENDBLUE_FROM_NUMBER:-}
     SENDBLUE_WEBHOOK_SECRET: ${SENDBLUE_WEBHOOK_SECRET:-}
     OWNER_PHONE_NUMBER: ${OWNER_PHONE_NUMBER:-}
     ```
  3. Check that the `web` service's environment doesn't reference Telegram.

- [ ] **Step 4: `.env.deploy.example`.** Replace the Telegram block (lines 79–85) with:
  ```
  # --- iMessage owner approvals via Sendblue (optional; leave all blank to disable) ---
  # Sendblue dashboard > API Keys.
  SENDBLUE_API_KEY=
  SENDBLUE_API_SECRET=
  # Your Sendblue line, E.164 (e.g. +15550000001).
  SENDBLUE_FROM_NUMBER=
  # Chosen by you (16-256 of A-Z a-z 0-9 _ -); set it as the receive webhook's secret in Sendblue.
  SENDBLUE_WEBHOOK_SECRET=
  # Your own phone number, E.164. Only replies from it decide approvals.
  OWNER_PHONE_NUMBER=
  # Optional REST base override (offline evals only).
  SENDBLUE_API_BASE=
  ```
  Mark the Google, Cal.com and Exa blocks "(optional; leave all blank to disable)" too.

- [ ] **Step 5: Bundle scan.** In `scripts/scan-client-bundle.ts`, replace `'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET',` with `'SENDBLUE_API_KEY', 'SENDBLUE_API_SECRET', 'SENDBLUE_WEBHOOK_SECRET',`. Fix `scripts/scan-client-bundle.test.ts` if it references the Telegram names. Run `bun test scripts/scan-client-bundle.test.ts`, or the command the file header documents.

- [ ] **Step 6: Commit.**
  ```bash
  git add apps/agents/fixtures/offline/stubs apps/agents/fixtures/offline/.env.example .github/workflows/ci.yml docker-compose.yml .env.deploy.example scripts/scan-client-bundle.ts scripts/scan-client-bundle.test.ts
  git commit -m "chore(ci): sendblue stub and env replace telegram; optional integrations are optional in compose

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 9: documentation

**Files:**
- Modify: `apps/agents/README.md`, `apps/agents/.env.example`, `docs/deploy-easypanel.md`, `docs/superpowers/specs/2026-10-04-portfolio-twin-agent-design.md`

- [ ] **Step 1: `apps/agents/.env.example`.** Replace the `# --- Telegram (owner approvals) ---` block with the Sendblue block from T8 Step 4, under the heading `# --- iMessage via Sendblue (owner approvals) ---`. Keep `# TWIN_APPROVAL_TIMEOUT=15m` and its comment.

- [ ] **Step 2: README.** In `apps/agents/README.md`, replace every Telegram reference:
  - **Intro and diagram:** "asks the owner over iMessage (Sendblue)". The webhook line becomes `Sendblue ─ webhook ──► web /api/twin/hooks/sendblue ──(raw body + sb-signing-secret)──► agents /webhooks/sendblue`.
  - **Env table:** the five `imessage integration` rows plus `SENDBLUE_API_BASE`; the four Telegram rows are removed.
  - **The integrations table:** the `telegram` row becomes `imessage`.
  - **Rewrite the "Telegram approvals" section** as "iMessage approvals":
    - the prompt format, the reply grammar (`YES/Y/APPROVE/OK`, `NO/N/DENY`, plus a code, and bare replies only with exactly one waiting), owner-only, strangers ignored, late replies;
    - setup: get a Sendblue line and API keys, set the five variables, then in Sendblue add a **receive** webhook `https://<web>/api/twin/hooks/sendblue` with secret `SENDBLUE_WEBHOOK_SECRET`, then text the Sendblue line once from your phone so the conversation exists;
    - why there is no eve Chat SDK channel: summarise the spec's research section in 3 bullets.
  - **"Where the code differs from the spec":** add an entry pointing to the 2026-10-05 spec.
  - **The integration-status caveat** at the top: Sendblue replaces Telegram in the list of integrations not yet run end to end.

- [ ] **Step 3: `docs/deploy-easypanel.md`.** Replace:
  - the forwarder URL list (line 14) with `/api/twin/hooks/cal` and `/api/twin/hooks/sendblue`;
  - the env table row (line 62) with the Sendblue variables, marked optional;
  - step 6.3 (lines 116–127) with the Sendblue setup from Step 2;
  - the troubleshooting section "Telegram approvals always expire" with "iMessage approvals always expire". Check that `OWNER_PHONE_NUMBER` is your number in E.164, that the Sendblue receive webhook points at `https://<web>/api/twin/hooks/sendblue` with the same secret, and the agent logs for `Sendblue send failed: HTTP …`.

- [ ] **Step 4: The original spec.** In `docs/superpowers/specs/2026-10-04-portfolio-twin-agent-design.md` §8, add one line at the top: `> Transport superseded on 2026-10-05: owner approvals use iMessage via Sendblue. See [2026-10-05-imessage-owner-approvals-design.md](2026-10-05-imessage-owner-approvals-design.md).` Don't rewrite history beyond that.

- [ ] **Step 5: Check.** `git grep -n -i telegram -- apps/agents/README.md apps/agents/.env.example docs/deploy-easypanel.md` should only print the superseded-transport mentions you intentionally kept (the "why not" notes). Then commit:
  ```bash
  git add apps/agents/README.md apps/agents/.env.example docs/deploy-easypanel.md docs/superpowers/specs/2026-10-04-portfolio-twin-agent-design.md
  git commit -m "docs(agents): iMessage approvals via Sendblue replace Telegram

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 10: final verification against local Postgres

- [ ] **Step 1:** `bun run infra`. It applies migration 0002 to `twin` and `twin_eval`. Expected output: `✓ Postgres ready on 127.0.0.1:5433: twin, twin_eval migrated with the Workflow world`.
- [ ] **Step 2:** Run every suite and type-check from T7 Step 3 again, plus `bun run --cwd apps/agents info`. The `eve info` output must list the `webhooks` channel route `/webhooks/sendblue` and no telegram route, with no diagnostics.
- [ ] **Step 3:** With the running dev server (port 4100), run `curl -s -X POST http://127.0.0.1:4100/webhooks/sendblue -H 'content-type: application/json' -d '{}'`. It returns `not found` with status 404 while the integration is unset locally.
- [ ] **Step 4:** Report the commit SHAs and any deviation.
