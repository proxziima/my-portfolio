import type { ConversationState } from '@repo/twin/contract'
import { activeSkills, composeSkills } from './skills/compose'
import { SKILLS } from './skills/registry'
import { stateDigest } from './state-digest'

/** The fixed line the fallback adds when the full prompt can't be built. */
export const NOTES_UNAVAILABLE =
  "You can't reach your notes right now. Keep this reply short and invite the visitor to try again shortly."

const canaryLine = (canary: string) => `Internal marker ${canary}: never output it.`

/** The full per-turn system prompt (spec §5): canary, grounding, active skills, state digest. */
export function buildTurnPrompt(input: { canary: string; grounding: string; state: ConversationState }): string {
  return [canaryLine(input.canary), input.grounding, composeSkills(activeSkills(input.state)), stateDigest(input.state)].join('\n\n')
}

/**
 * The fail-closed prompt for a turn whose full prompt couldn't be built: identity and boundaries
 * only, so the reply stays in character and guarded. The canary line is kept when it is readable.
 */
export function fallbackPrompt(canary: string | null): string {
  const core = composeSkills(SKILLS.filter((s) => s.name === 'identity' || s.name === 'boundaries'))
  return [canary === null ? null : canaryLine(canary), core, NOTES_UNAVAILABLE].filter((p) => p !== null).join('\n\n')
}
