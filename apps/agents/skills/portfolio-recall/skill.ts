import { defineTwinSkill } from '../../agent/lib/skills/define'

export default defineTwinSkill({ name: 'portfolio-recall', tools: ['search_portfolio', 'request_disclosure'], activeWhen: (s) => !s.ended })
