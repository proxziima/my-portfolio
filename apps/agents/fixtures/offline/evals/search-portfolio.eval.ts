import { getConversation } from '@repo/twin/db'
import { defineEval } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'
import type config from './evals.config'

/**
 * Search reaches the Payload MCP (stubbed) and its citations land in the conversation state. The
 * fixture runs with iMessage off, so the stub's restricted entry (knowledge:9) must be dropped:
 * without an owner to approve it, the model may never learn it exists.
 */
export default defineEval<typeof config>({
  description: 'search_portfolio returns public results, drops restricted ones with iMessage off, and records citations',
  tags: ['offline', 'plumbing'],
  async test(t) {
    const turn = await t.send('FACT: what have you built?')
    turn.calledTool('search_portfolio', {
      output: (out) =>
        JSON.stringify(out).includes('"sourceId":"projects:1"') &&
        !JSON.stringify(out).includes('"sourceId":"knowledge:9"'),
      count: 1,
    })
    const row = await getConversation(t.context.db, turn.sessionId)
    t.check(
      row?.state.citedSources,
      satisfies((v) => Array.isArray(v) && v.includes('projects:1'), 'cites projects:1'),
    )
    t.succeeded()
  },
})
