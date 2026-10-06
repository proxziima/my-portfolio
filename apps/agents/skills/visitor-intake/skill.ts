import { defineTwinSkill } from '../../agent/lib/skills/define'

export default defineTwinSkill({ name: 'visitor-intake', tools: ['note_visitor', 'web_search'], activeWhen: (s) => !s.ended })
