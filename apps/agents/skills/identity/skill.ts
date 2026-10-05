import { defineTwinSkill } from '../../agent/lib/skills/define'

export default defineTwinSkill({ name: 'identity', tools: [], activeWhen: () => true })
