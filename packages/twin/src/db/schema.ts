import { sql } from 'drizzle-orm'
import {
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
  uniqueIndex,
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

export const approvals = twin.table(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: sessionRef(),
    // The tool call that opened it, so a retried step or re-dispatched run reuses the row.
    callId: text('call_id'),
    sourceId: text('source_id').notNull(),
    topic: text('topic').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    webhookUrl: text('webhook_url'),
    // What the owner types back ("YES K7Q2"); unique among pending approvals only.
    replyCode: text('reply_code').notNull(),
    // Set once the owner has been texted; the notify step's idempotency marker.
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    actor: text('actor'),
    reasoning: text('reasoning'),
  },
  (t) => [
    uniqueIndex('approvals_session_call_uq').on(t.sessionId, t.callId),
    index('approvals_session_source_idx').on(t.sessionId, t.sourceId),
    uniqueIndex('approvals_pending_code_uq').on(t.replyCode).where(sql`${t.status} = 'pending'`),
  ],
)

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
