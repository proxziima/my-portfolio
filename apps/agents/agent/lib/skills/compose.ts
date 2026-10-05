import type { ConversationState } from '@repo/twin/contract'
import type { ToolName } from './define'
import { SKILLS, type TwinSkill } from './registry'

/** Skills active for this state, in prompt order. */
export function activeSkills(state: ConversationState): TwinSkill[] {
  return SKILLS.filter((s) => s.activeWhen(state))
}

/** Tools offered this step: the union of what active skills grant. */
export function toolsFor(state: ConversationState): ToolName[] {
  return [...new Set(activeSkills(state).flatMap((s) => s.tools))]
}

/** The skills part of the system prompt: one delimited, versioned block per skill. */
export function composeSkills(skills: readonly TwinSkill[]): string {
  return skills.map((s) => `<skill name="${s.name}" version="${s.version}">\n${s.body}\n</skill>`).join('\n\n')
}
