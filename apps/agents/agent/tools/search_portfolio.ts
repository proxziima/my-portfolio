import { TwinSearchResult } from '@repo/twin/contract'
import { updateConversation } from '@repo/twin/db'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { db } from '../lib/db'
import { searchForModel, searchPortfolio, stateAfterSearch } from '../lib/search'
import { toolGranted } from '../lib/tool-gate'
import { untrustedKey } from '../lib/untrusted'

const tool = defineTool({
  description: 'Search my portfolio knowledge base: bio, roles, projects, case studies, stack, writing, facts. Call it before any factual claim about me.',
  inputSchema: z.object({ query: z.string().min(2).max(200).describe('A few focused keywords') }),
  outputSchema: TwinSearchResult,
  async execute({ query }, ctx) {
    const result = await searchPortfolio(ctx.session.id, query)
    await updateConversation(db(), ctx.session.id, (s) => stateAfterSearch(s, result))
    return result
  },
  toModelOutput: (result) => ({ type: 'text', value: searchForModel(result, untrustedKey()) }),
})

/** Offered only while a skill granting it is active (spec §5). */
export default defineDynamic({
  events: {
    'step.started': async (_event, ctx) => ((await toolGranted(ctx.session.id, 'search_portfolio')) ? tool : null),
  },
})
