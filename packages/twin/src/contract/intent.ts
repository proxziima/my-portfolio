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
