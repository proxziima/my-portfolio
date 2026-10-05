import type { ConversationState } from '@repo/twin/contract'

/** Deterministic signals, read from state only (spec §7). */
export interface IntentSignals {
  turnCount: number
  availabilityChecked: boolean
  hiringLogisticsAsked: boolean
  specificWorkCited: boolean
  deepConversation: boolean
  visitorIdentified: boolean
  hiringRole: boolean
  returningVisitor: boolean
}

/** Extracts the signals from the conversation record. */
export function signalsOf(s: ConversationState): IntentSignals {
  return {
    turnCount: s.turnCount,
    availabilityChecked: s.toolsUsed.includes('check_availability'),
    hiringLogisticsAsked: s.restrictedCategoriesRequested.some((c) => c === 'availability' || c === 'compensation'),
    specificWorkCited: s.citedSources.some((id) => /^(projects|experiences|content):/.test(id)),
    deepConversation: new Set(s.citedSources).size >= 3,
    visitorIdentified: Boolean(s.visitor.name || s.visitor.company),
    hiringRole: s.visitor.kind === 'recruiter' || s.visitor.kind === 'hiring_manager' || s.visitor.kind === 'client',
    returningVisitor: s.returningVisitor,
  }
}
