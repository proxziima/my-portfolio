import type { IntentClass } from '@repo/twin/contract'

/**
 * The single tuning surface for call intent (spec §7). Every evaluation is persisted with its
 * signals, score and outcome, so these numbers are tuned against real conversations, not guessed.
 * Rationale for each weight is next to it; change one, update its comment.
 */
export const INTENT_WEIGHTS = {
  classification: {
    // Corroborating evidence only. A genuine ask is answered in the same reply by the main model
    // (scheduling skill's explicit-request rule, schedule_call trigger explicit_request); this label
    // comes from a cheap post-reply classifier and can misread "tell me more" as "let's talk", so on
    // its own it must never force the widget. Kept below hotAt: one misread reaches warm at most.
    requesting_call: 3,
    // Talking about a role, hiring or a project for me is the strongest implicit signal.
    hiring_signal: 4,
    // Assessing fit (comparing, probing depth) is interest but not yet intent.
    evaluating: 2,
    browsing: 0,
    // Off-topic chat pulls away from a call.
    unrelated: -2,
  } satisfies Record<IntentClass, number>,
  signals: {
    // Asking about my calendar is a logistics question people only ask when they want time.
    availabilityChecked: 2.5,
    // Notice period or compensation questions are hiring-process questions.
    hiringLogisticsAsked: 2,
    // Naming a specific project or role of mine means real engagement.
    specificWorkCited: 1,
    // Breadth: three or more distinct sources cited.
    deepConversation: 1,
    // Introducing themselves (name or company) signals intent to continue.
    visitorIdentified: 1,
    // Recruiters and hiring managers book calls; casual engineers mostly don't.
    hiringRole: 1,
    // Coming back is commitment a first visit can't show.
    returningVisitor: 1,
    // Long conversations trend toward calls; 0.5 per turn after the third, capped.
    perTurnAfterThird: 0.5,
    perTurnCap: 2,
  },
  thresholds: { warmAt: 4, hotAt: 7 },
} as const
