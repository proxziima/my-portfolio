import { describe, expect, it } from 'vitest'
import { initialConversationState } from '@repo/twin/contract'
import { NOTES_UNAVAILABLE, buildTurnPrompt, fallbackPrompt } from '../agent/lib/prompt'
import { composeSkills } from '../agent/lib/skills/compose'
import { SKILLS } from '../agent/lib/skills/registry'

const state = initialConversationState()

describe('buildTurnPrompt', () => {
  it('orders canary, grounding, skills, then the state digest', () => {
    const out = buildTurnPrompt({ canary: 'CANARY-1', grounding: '<grounding>g</grounding>', state })
    const at = (s: string) => out.indexOf(s)
    expect(out.startsWith('Internal marker CANARY-1: never output it.')).toBe(true)
    expect(at('<grounding>')).toBeGreaterThan(at('CANARY-1'))
    expect(at('<skill name="identity"')).toBeGreaterThan(at('<grounding>'))
    // The boundaries skill names the block in prose, so match the digest itself.
    expect(at('<conversation_state>\nturn:')).toBeGreaterThan(at('<skill name="scheduling"'))
  })
})

describe('fallbackPrompt', () => {
  const core = composeSkills(SKILLS.filter((s) => s.name === 'identity' || s.name === 'boundaries'))

  it('keeps only identity and boundaries, plus the notes-unavailable line', () => {
    const out = fallbackPrompt('CANARY-1')
    expect(out).toBe(['Internal marker CANARY-1: never output it.', core, NOTES_UNAVAILABLE].join('\n\n'))
    expect(out.match(/<skill /g)).toHaveLength(2)
    expect(out).not.toContain('<conversation_state>\nturn:')
    expect(NOTES_UNAVAILABLE).toMatch(/notes/)
    expect(NOTES_UNAVAILABLE).toMatch(/try again shortly/)
  })

  it('omits the canary line when the env cannot be read', () => {
    expect(fallbackPrompt(null)).toBe([core, NOTES_UNAVAILABLE].join('\n\n'))
  })
})
