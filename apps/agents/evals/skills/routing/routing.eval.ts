import { defineEval } from 'eve/evals'
import type { ModelTier } from '@repo/twin/contract'
import { modelIds } from '../../../agent/lib/models'

/** Routing: each question runs on the tier the pre-turn gate picks, read from the turn's `step.started` model ids. */
function routed(question: string, tier: ModelTier) {
  return defineEval({
    description: `routing: "${question}" runs on the ${tier} model`,
    tags: ['live', 'routing'],
    async test(t) {
      // The ids come from the same env resolution the agent uses, so a TWIN_MODEL* override does not break the eval.
      const expected = modelIds(process.env).tiers[tier].id
      // The channel only classifies a message that arrives on an existing session, and `t.send` would create the session
      // and send in one request (no session id yet, so the gate is skipped and every case would run on standard).
      const session = await t.session()
      const turn = await session.send(question)
      turn.eventsSatisfy(`every step starts on ${expected}`, (events) => {
        const started = events.filter((e) => e.type === 'step.started')
        return started.length > 0 && started.every((e) => e.data.modelId === expected)
      })
      t.succeeded()
    },
  })
}

export default [
  routed('Oi, tudo bem?', 'light'),
  routed('Me conta do seu trabalho no Autodoc', 'standard'),
  routed('Como você desenharia o pipeline de evals pra um agente RAG com release gates?', 'deep'),
]
