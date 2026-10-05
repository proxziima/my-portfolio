import { createHmac } from 'node:crypto'
import { addUnique, VisitorKind } from '@repo/twin/contract'
import { getConversation, setStableKeyHash, updateConversation } from '@repo/twin/db'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { db } from '../lib/db'
import { getEnv } from '../lib/env'
import { mergeVisitor } from '../lib/merge-visitor'
import { toolGranted } from '../lib/tool-gate'

const tool = defineTool({
  description: 'Note who the visitor said they are. Only what they volunteered; never invent.',
  inputSchema: z.object({
    // No length caps here: the contract sanitiser truncates long input instead of rejecting it.
    name: z.string().optional(),
    company: z.string().optional(),
    role: z.string().optional(),
    kind: VisitorKind.optional(),
    technical: z.boolean().optional(),
    email: z.email().optional().describe('Only if they shared it; stored as a one-way hash, never as text'),
  }),
  outputSchema: z.object({ noted: z.literal(true) }),
  async execute({ email, ...visitor }, ctx) {
    // Sanitised before merging, so input that cleans to nothing never erases a stored value.
    await updateConversation(db(), ctx.session.id, (s) => ({
      ...s,
      visitor: mergeVisitor(s.visitor, visitor),
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
