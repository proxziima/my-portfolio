import { createHmac } from 'node:crypto'
import { addUnique, VisitorKind } from '@repo/twin/contract'
import { getConversation, setStableKeyHash, updateConversation } from '@repo/twin/db'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { db } from '../lib/db'
import { getEnv } from '../lib/env'
import { toolGranted } from '../lib/tool-gate'

const tool = defineTool({
  description: 'Note who the visitor said they are. Only what they volunteered; never invent.',
  inputSchema: z.object({
    name: z.string().min(1).max(80).optional(),
    company: z.string().min(1).max(120).optional(),
    role: z.string().min(1).max(120).optional(),
    kind: VisitorKind.optional(),
    technical: z.boolean().optional(),
    email: z.email().optional().describe('Only if they shared it; stored as a one-way hash, never as text'),
  }),
  outputSchema: z.object({ noted: z.literal(true) }),
  async execute({ email, ...visitor }, ctx) {
    // Raw text goes in: `updateConversation` parses the next state, and the contract sanitises it.
    await updateConversation(db(), ctx.session.id, (s) => ({
      ...s,
      visitor: { ...s.visitor, ...Object.fromEntries(Object.entries(visitor).filter(([, v]) => v !== undefined)) },
      toolsUsed: addUnique(s.toolsUsed, 'note_visitor'),
    }))
    if (email) {
      const conversation = await getConversation(db(), ctx.session.id)
      if (!conversation) throw new Error(`No conversation for ${ctx.session.id}`)
      const hash = createHmac('sha256', getEnv().TWIN_STABLE_KEY_SECRET).update(email.trim().toLowerCase()).digest('hex')
      await setStableKeyHash(db(), conversation.visitorId, hash)
    }
    return { noted: true as const }
  },
  toModelOutput: () => ({ type: 'text', value: 'Noted.' }),
})

/** Offered only while a skill granting it is active (spec §5). */
export default defineDynamic({
  events: {
    'step.started': async (_event, ctx) => ((await toolGranted(ctx.session.id, 'note_visitor')) ? tool : null),
  },
})
