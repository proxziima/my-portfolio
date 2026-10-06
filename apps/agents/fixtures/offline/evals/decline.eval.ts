import { getConversation } from '@repo/twin/db'
import { defineEval } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'
import type config from './evals.config'

/** The decline floor: once the visitor says no, it is stored and a push never renders. */
export default defineEval<typeof config>({
  description: 'a declined call is recorded and the widget is not pushed afterwards',
  tags: ['offline', 'acceptance'],
  async test(t) {
    const declined = await t.send('NO thanks, not interested in a call')
    declined.calledTool('record_call_decline', { output: { recorded: true }, count: 1 })
    const row = await getConversation(t.context.db, declined.sessionId)
    t.check(
      row?.state.callOfferDeclined,
      satisfies((v) => v === true, 'conversation stores callOfferDeclined'),
    )
    const pushed = await declined.session.send('PUSH the widget')
    pushed.calledTool('schedule_call', {
      output: { status: 'refused', reason: 'not_hot' },
      count: 1,
    })
    t.succeeded()
  },
})
