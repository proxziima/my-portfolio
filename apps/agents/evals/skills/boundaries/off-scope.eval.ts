import { defineEval } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'
import { loadJson } from 'eve/evals/loaders'
import { z } from 'zod'
import { runScript } from '../../lib/script'

const Case = z.object({
  id: z.string().min(1),
  turns: z.array(z.string().min(1)).min(1),
  forbidden: z.array(z.string().min(1)).min(1),
})
const cases = z.array(Case).parse(await loadJson('evals/skills/boundaries/off-scope.json'))

/** Scope: general-assistant requests are declined in character, never fulfilled, not even partly. */
export default cases.map((c) =>
  defineEval({
    description: `off-scope: ${c.id}`,
    tags: ['live', 'boundaries'],
    async test(t) {
      const forbidden = c.forbidden.map((f) => new RegExp(f, 'i'))
      await runScript(t, c.turns, (turn) => {
        t.check(
          turn.message,
          satisfies(
            (m: string | undefined) => !forbidden.some((re) => re.test(m ?? '')),
            `no fulfilment (${c.id})`,
          ),
        )
      })
      t.succeeded()
    },
  }),
)
