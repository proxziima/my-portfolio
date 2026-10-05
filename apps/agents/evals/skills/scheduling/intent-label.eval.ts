import { defineEval } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'
import { loadJson } from 'eve/evals/loaders'
import { z } from 'zod'
import { IntentClass } from '@repo/twin/contract'
import { classifyIntent } from '../../../agent/lib/intent/classify'

/** One labelled conversation: the recent turns as the label sees them, and the labels that are right. */
const Case = z.object({
  id: z.string().min(1),
  turns: z.array(z.object({ role: z.enum(['visitor', 'twin']), text: z.string().min(1) })).min(1),
  expected: z.array(IntentClass).min(1),
})

const cases = z.array(Case).parse(await loadJson('evals/skills/scheduling/intent-label.json'))

// The production budget (TWIN_CLASSIFIER_TIMEOUT_MS). Latency is tracked against it, not gated: a
// slow label is dropped in production (signals only), so accuracy is what this eval gates.
const BUDGET_MS = Number(process.env.TWIN_CLASSIFIER_TIMEOUT_MS?.trim() || 4_000)
const GENEROUS_MS = 15_000

/**
 * The intent label on a multi-turn PT/EN regression set, called directly: the model and prompt the
 * agent uses (TWIN_INTENT_MODEL), without a session. It includes the production misread, "Sim, fala
 * mais da Nexo Labs." labelled requesting_call. Add every new misread here.
 */
export default cases.map((c) =>
  defineEval({
    description: `intent label: ${c.id} is ${c.expected.join(' or ')}`,
    tags: ['live', 'scheduling'],
    async test(t) {
      const started = performance.now()
      const label = await classifyIntent(c.turns, GENEROUS_MS)
      const ms = Math.round(performance.now() - started)
      t.log(`${c.id}: ${label ?? 'null'} in ${ms} ms`)
      t.check(label, satisfies((l: IntentClass | null) => l !== null && c.expected.includes(l), `labelled ${c.expected.join(' or ')}`))
      t.check(ms, satisfies((v: number) => v <= BUDGET_MS, `answered within ${BUDGET_MS} ms`)).soft()
    },
  }),
)
