import { defineEval } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'
import { runScript } from '../../lib/script'
import { OFF_SCOPE_CASES } from './off-scope-cases'

/** Scope: general-assistant requests are declined in character, never fulfilled, not even partly. */
export default OFF_SCOPE_CASES.map((c) =>
  defineEval({
    description: `off-scope: ${c.id}`,
    tags: ['live', 'boundaries'],
    async test(t) {
      await runScript(t, c.turns, (turn) => {
        t.check(
          turn.message,
          satisfies(
            (m: string | undefined) => !c.forbidden.some((re) => re.test(m ?? '')),
            `no fulfilment (${c.id})`,
          ),
        )
      })
      t.succeeded()
    },
  }),
)
