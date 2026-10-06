import { defineEval } from 'eve/evals'
import { mockEventModelId } from '../mock-models'
import type config from './evals.config'

/**
 * The scripted model goes through the same dynamic resolver as the real agent. The fixture's gate times
 * out by design (`TWIN_ABUSE_TIMEOUT_MS=1`), which routes to standard: every step must start on the
 * standard mock, which only holds if the channel's tier write and `currentTier` are wired end to end.
 */
export default defineEval<typeof config>({
  description: 'every step of a turn starts on the tier the resolver picks (standard when the gate times out)',
  tags: ['offline', 'routing'],
  async test(t) {
    // The channel classifies only a message that arrives on an existing session.
    const session = await t.session()
    const turn = await session.send('Hi there')
    turn.eventsSatisfy(`every step starts on ${mockEventModelId('standard')}`, (events) => {
      const started = events.filter((e) => e.type === 'step.started')
      return started.length > 0 && started.every((e) => e.data.modelId === mockEventModelId('standard'))
    })
    t.succeeded()
  },
})
