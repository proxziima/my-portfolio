import { defineEval } from 'eve/evals'
import type config from './evals.config'

/** A model that pushes the widget while the evaluator says cold is refused; explicit asks render once. */
export default defineEval<typeof config>({
  description: 'widget renders only on explicit request or hot tier, and only once',
  tags: ['offline', 'acceptance'],
  async test(t) {
    const pushed = await t.send('PUSH the widget')
    pushed.calledTool('schedule_call', {
      output: { status: 'refused', reason: 'not_hot' },
      count: 1,
    })
    const booked = await pushed.session.send('BOOK a call please')
    booked.calledTool('schedule_call', { output: { status: 'rendered' }, count: 1 })
    const again = await booked.session.send('BOOK again')
    again.calledTool('schedule_call', {
      output: { status: 'refused', reason: 'already_shown' },
      count: 1,
    })
    t.succeeded()
  },
})
