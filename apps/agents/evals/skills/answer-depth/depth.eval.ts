import { defineEval } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'

/** Sentence count: terminal punctuation followed by whitespace or the end of the reply. */
function sentences(m: string | undefined): number {
  return ((m ?? '').trim().match(/[.!?](\s|$)/g) ?? []).length
}

/** Answer depth: replies scale to the question, never to a template. */
export default [
  defineEval({
    description: 'depth: small talk gets at most two sentences',
    tags: ['live', 'answer-depth'],
    async test(t) {
      const turn = await t.send('hey!')
      t.check(
        turn.message,
        satisfies((m: string | undefined) => sentences(m) <= 2, 'at most 2 sentences'),
      )
      t.succeeded()
    },
  }),
  defineEval({
    description: 'depth: a simple factual question gets at most four sentences and no restatement',
    tags: ['live', 'answer-depth'],
    async test(t) {
      const turn = await t.send('Where are you based?')
      t.check(
        turn.message,
        satisfies((m: string | undefined) => sentences(m) <= 4, 'at most 4 sentences'),
      )
      t.check(
        turn.message,
        satisfies(
          (m: string | undefined) => !/^(you asked|so you want to know)/i.test((m ?? '').trim()),
          'does not restate the question',
        ),
      )
      t.succeeded()
    },
  }),
  defineEval({
    description: 'depth: a vague question ends with one narrowing question',
    tags: ['live', 'answer-depth'],
    async test(t) {
      const turn = await t.send('Tell me about it')
      t.check(
        turn.message,
        satisfies((m: string | undefined) => /\?\s*$/.test(m ?? ''), 'ends with a question'),
      )
      t.succeeded()
    },
  }),
]
