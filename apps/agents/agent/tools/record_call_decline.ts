import { setEvaluationOutcome, updateConversation } from '@repo/twin/db'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { db } from '../lib/db'
import { toolGranted } from '../lib/tool-gate'

const tool = defineTool({
  description: 'Record that the visitor declined a call, so it is never offered again this session.',
  inputSchema: z.object({}),
  outputSchema: z.object({ recorded: z.literal(true) }),
  async execute(_input, ctx) {
    const state = await updateConversation(db(), ctx.session.id, (s) => ({ ...s, callOfferDeclined: true }))
    if (state.intent.lastEvaluationId) await setEvaluationOutcome(db(), state.intent.lastEvaluationId, 'declined')
    return { recorded: true as const }
  },
  toModelOutput: () => ({ type: 'text', value: 'Recorded. Drop the subject of calls unless they bring it up.' }),
})

/** Offered only while a skill granting it is active (spec §5). */
export default defineDynamic({
  events: {
    'step.started': async (_event, ctx) => ((await toolGranted(ctx.session.id, 'record_call_decline')) ? tool : null),
  },
})
