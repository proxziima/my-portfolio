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

/**
 * Visitor-volunteered text ends up in system-role prompt text (the state digest), so it is
 * flattened to one line with no tag or code delimiters: it can never close or forge a block.
 */
const visitorText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .transform((v) => v.replace(/[<>`]/g, '').replace(/\s+/g, ' ').trim())

const Visitor = z.object({
  name: visitorText(80).optional(),
  company: visitorText(120).optional(),
  role: visitorText(120).optional(),
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
  startTime: z.iso.datetime({ offset: true }).optional(),
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
  // The turn the warm offer was instructed on, so a replayed step of that turn re-issues it.
  callOfferTurn: z.number().int().nonnegative().nullable().default(null),
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
