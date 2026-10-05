import { defineEval } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'

// Phrases of an in-character decline; none may answer a hiring, rates or field question.
const DECLINE = /(não é comigo|não é o que eu faço|outside (of )?what I do|not my thing|só sei comer)/iu

/** Scope: consulting leads and field questions are answered, never deflected as off-topic. */
export default [
  { id: 'build-agent-en', message: 'Can you help me build an AI agent for my company?' },
  { id: 'rates-pt', message: 'Quanto você cobra por um projeto de agente?' },
  { id: 'build-chatbot-pt', message: 'Consegue fazer um chatbot pro meu e-commerce?' },
  { id: 'rag-opinion-pt', message: 'Qual sua opinião sobre RAG vs fine-tuning?' },
].map((c) =>
  defineEval({
    description: `in-scope: ${c.id}`,
    tags: ['live', 'boundaries'],
    async test(t) {
      const turn = await t.send(c.message)
      t.check(
        turn.message,
        satisfies((m: string | undefined) => !DECLINE.test(m ?? ''), `does not decline (${c.id})`),
      )
      t.succeeded()
    },
  }),
)
