import type { ConversationState, IntentClass, IntentEvaluation, IntentTier } from '@repo/twin/contract'
import type { IntentSignals } from './signals'
import { INTENT_WEIGHTS as W } from './weights'

/**
 * Composite score: the enum classification plus deterministic signals, then tiers and floors.
 * `classification` is null when the classifier was unavailable; the evaluation still happens.
 */
export function scoreIntent(sig: IntentSignals, classification: IntentClass | null, s: ConversationState): IntentEvaluation {
  const reasons: string[] = []
  let score = 0
  const add = (points: number, reason: string) => {
    if (points === 0) return
    score += points
    reasons.push(`${reason} (${points > 0 ? '+' : ''}${points})`)
  }
  if (classification === null) reasons.push('classifier unavailable: signals only (0)')
  else add(W.classification[classification], `classified ${classification}`)
  if (sig.availabilityChecked) add(W.signals.availabilityChecked, 'availability checked')
  if (sig.hiringLogisticsAsked) add(W.signals.hiringLogisticsAsked, 'notice period or compensation asked')
  if (sig.specificWorkCited) add(W.signals.specificWorkCited, 'specific work discussed')
  if (sig.deepConversation) add(W.signals.deepConversation, 'three or more sources cited')
  if (sig.visitorIdentified) add(W.signals.visitorIdentified, 'visitor introduced themselves')
  if (sig.hiringRole) add(W.signals.hiringRole, 'visitor is hiring or a client')
  if (sig.returningVisitor) add(W.signals.returningVisitor, 'returning visitor')
  add(Math.min(W.signals.perTurnCap, Math.max(0, sig.turnCount - 3) * W.signals.perTurnAfterThird), `turn ${sig.turnCount}`)

  if (classification === 'requesting_call') return { score, tier: 'hot', reasons: ['explicit request to talk', ...reasons] }
  if (s.callOfferDeclined && score >= W.thresholds.warmAt) {
    score = W.thresholds.warmAt - 1
    reasons.push(`call offer declined earlier: capped at ${score}`)
  }
  let tier: IntentTier = score >= W.thresholds.hotAt ? 'hot' : score >= W.thresholds.warmAt ? 'warm' : 'cold'
  // Spec floor: once the widget is on screen the tier stays, so the booking UI doesn't flicker away.
  if (s.widgetShown && tier !== s.intent.tier) {
    tier = s.intent.tier
    reasons.push(`widget shown: tier stays ${tier}`)
  }
  if (reasons.length === 0) reasons.push('no intent signals (0)')
  return { score, tier, reasons }
}
