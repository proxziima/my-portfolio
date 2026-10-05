import type { ConversationState } from '@repo/twin/contract'

/** Model-facing tools a skill may grant. `no_reply` is framework-level and always available. */
export const TOOL_NAMES = ['search_portfolio', 'request_disclosure', 'note_visitor', 'web_search', 'check_availability', 'schedule_call', 'record_call_decline'] as const
export type ToolName = (typeof TOOL_NAMES)[number]

/** The six skills, in prompt order (identity first, so voice frames everything after it). */
export const SKILL_NAMES = ['identity', 'boundaries', 'answer-depth', 'portfolio-recall', 'visitor-intake', 'scheduling'] as const
export type SkillName = (typeof SKILL_NAMES)[number]

/** The typed half of a skill; the prose half is its SKILL.md. */
export interface TwinSkillManifest {
  name: SkillName
  tools: readonly ToolName[]
  activeWhen: (state: ConversationState) => boolean
}

/** Identity helper giving manifests a checked shape. */
export function defineTwinSkill(manifest: TwinSkillManifest): TwinSkillManifest {
  return manifest
}
