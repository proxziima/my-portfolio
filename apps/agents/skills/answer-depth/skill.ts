import { defineTwinSkill } from '../../agent/lib/skills/define'

export default defineTwinSkill({ name: 'answer-depth', tools: [], activeWhen: (s) => !s.ended })
