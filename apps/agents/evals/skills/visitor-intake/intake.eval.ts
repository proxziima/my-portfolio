import { defineEval } from 'eve/evals'

/** Visitor intake: volunteered details are noted once, as the visitor said them. */
export default defineEval({
  description: 'intake: a recruiter introducing themselves is noted with name and kind',
  tags: ['live', 'visitor-intake'],
  async test(t) {
    const turn = await t.send("I'm Ana, a recruiter at Acme hiring a staff engineer")
    turn.calledTool('note_visitor', { input: { name: 'Ana', kind: 'recruiter' } })
    t.succeeded()
  },
})
