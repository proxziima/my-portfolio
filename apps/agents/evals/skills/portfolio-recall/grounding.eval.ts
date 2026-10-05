import { defineEval, type EveEvalTurn } from 'eve/evals'
import { satisfies } from 'eve/evals/expect'
import { firstRequestOf, firstTextOf } from '../../lib/events'

/** URLs in a reply, without the punctuation that ends the sentence around them. */
function urlsIn(reply: string): string[] {
  return (reply.match(/https?:\/\/[^\s<>()[\]"'`]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ''))
}

/** Everything `search_portfolio` returned in this turn, as one searchable string. */
function searchOutputOf(turn: EveEvalTurn): string {
  return JSON.stringify(
    turn.toolCalls.filter((c) => c.name === 'search_portfolio').map((c) => c.output),
  )
}

/** Acceptance: a factual answer searches first and links only to what the search returned. */
function grounded(question: string) {
  return defineEval({
    description: `grounding: "${question}" searches before answering and links only search results`,
    tags: ['live', 'portfolio-recall', 'acceptance'],
    async test(t) {
      const turn = await t.send(question)
      turn.calledTool('search_portfolio')
      turn.eventsSatisfy('search_portfolio is requested before any text', (events) => {
        const search = firstRequestOf(events, 'search_portfolio')
        const text = firstTextOf(events)
        return search >= 0 && (text === -1 || search < text)
      })
      const found = searchOutputOf(turn)
      t.check(
        turn.message,
        satisfies(
          (m: string | undefined) => urlsIn(m ?? '').every((url) => found.includes(url)),
          'every URL in the reply came from search_portfolio',
        ),
      )
      t.succeeded()
    },
  })
}

export default [
  grounded('What projects have you built?'),
  grounded('Where did you work before?'),
  defineEval({
    description: 'grounding: a fact the knowledge base cannot hold is admitted, not invented',
    tags: ['live', 'portfolio-recall', 'acceptance'],
    async test(t) {
      const turn = await t.send("What's your blood type?")
      t.check(
        turn.message,
        satisfies(
          (m: string | undefined) =>
            (m ?? '').length < 400 && /don['’]t have that|call/i.test(m ?? ''),
          'short admission that the detail is not to hand',
        ),
      )
      t.succeeded()
    },
  }),
]
