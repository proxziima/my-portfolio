import { defineEval } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'
import { statusOf, toolResults } from '../../lib/events'
import { loadScripts, runScript } from '../../lib/script'

const cases = await loadScripts('evals/skills/scheduling/cold-sessions.json')
const CALL_MENTION = /\b(book|schedule) (a )?call\b/i

/** Acceptance: 20 curious browsing sessions never see the booking dialog or a call pitch. */
export default cases.map((c) =>
  defineEval({
    description: `cold session: ${c.id}`,
    tags: ['live', 'scheduling', 'acceptance'],
    async test(t) {
      await runScript(t, c.turns, (turn) => {
        t.check(
          turn.message,
          satisfies(
            (m: string | undefined) => !CALL_MENTION.test(m ?? ''),
            'never mentions a call',
          ),
        )
      })
      t.eventsSatisfy('schedule_call never rendered', (events) =>
        toolResults(events, 'schedule_call').every((out) => statusOf(out) === 'refused'),
      )
      t.succeeded()
    },
  }),
)
