import { defineTwinSkill } from '../../agent/lib/skills/define'

export default defineTwinSkill({
  name: 'scheduling',
  tools: ['check_availability', 'schedule_call', 'record_call_decline'],
  activeWhen: (s) => !s.ended && s.booking.status !== 'confirmed',
})
