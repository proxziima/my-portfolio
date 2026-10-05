import { describe, expect, it } from 'vitest'
import { initialConversationState } from '@repo/twin/contract'
import { activeSkills, composeSkills, toolsFor } from '../agent/lib/skills/compose'
import { SKILLS } from '../agent/lib/skills/registry'

const base = initialConversationState()

describe('skills', () => {
  it('registers the six skills in a fixed order', () => {
    expect(SKILLS.map((s) => s.name)).toEqual(['identity', 'boundaries', 'answer-depth', 'portfolio-recall', 'visitor-intake', 'scheduling'])
  })

  it('always keeps identity and boundaries, even when the conversation ended', () => {
    expect(activeSkills({ ...base, ended: true }).map((s) => s.name)).toEqual(['identity', 'boundaries'])
  })

  it('drops scheduling once a call is booked', () => {
    const booked = { ...base, booking: { status: 'confirmed' as const } }
    expect(activeSkills(booked).map((s) => s.name)).not.toContain('scheduling')
    expect(toolsFor(booked)).not.toContain('schedule_call')
  })

  it('offers only tools granted by an active skill', () => {
    expect(toolsFor(base).sort()).toEqual(['check_availability', 'note_visitor', 'record_call_decline', 'request_disclosure', 'schedule_call', 'search_portfolio', 'web_search'])
    expect(toolsFor({ ...base, ended: true })).toEqual([])
  })

  it('composes versioned, delimited skill blocks with no duplicated text', () => {
    const text = composeSkills(activeSkills(base))
    expect(text).toMatch(/<skill name="identity" version="\d+\.\d+\.\d+">/)
    expect(text.match(/<skill /g)).toHaveLength(6)
  })
})
