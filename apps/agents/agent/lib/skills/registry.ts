import answerDepth from '../../../skills/answer-depth/skill'
import boundaries from '../../../skills/boundaries/skill'
import identity from '../../../skills/identity/skill'
import portfolioRecall from '../../../skills/portfolio-recall/skill'
import scheduling from '../../../skills/scheduling/skill'
import visitorIntake from '../../../skills/visitor-intake/skill'
import { SKILL_NAMES, type TwinSkillManifest } from './define'
import { SKILL_FILES } from './generated'

/** A complete skill: manifest plus its SKILL.md prose and version. */
export interface TwinSkill extends TwinSkillManifest {
  version: string
  body: string
}

const manifests: Record<string, TwinSkillManifest> = {
  identity,
  boundaries,
  'answer-depth': answerDepth,
  'portfolio-recall': portfolioRecall,
  'visitor-intake': visitorIntake,
  scheduling,
}

/** All skills in prompt order; a missing SKILL.md or manifest fails at startup, not mid-turn. */
export const SKILLS: readonly TwinSkill[] = SKILL_NAMES.map((name) => {
  const manifest = manifests[name]
  const file = (SKILL_FILES as Record<string, { version: string; body: string } | undefined>)[name]
  if (!manifest || !file) throw new Error(`Skill ${name} is missing its manifest or SKILL.md`)
  return { ...manifest, version: file.version, body: file.body }
})
