import Exa from 'exa-js'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { getEnv } from '../lib/env'
import { toolGranted } from '../lib/tool-gate'
import { untrusted, untrustedKey } from '../lib/untrusted'

const Result = z.object({ results: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string() })) })

const tool = defineTool({
  description: "Public web context about the visitor's company or the role they mention. Never for searching people.",
  inputSchema: z.object({ query: z.string().min(3).max(200) }),
  outputSchema: Result,
  async execute({ query }) {
    const exa = new Exa(getEnv().EXA_API_KEY)
    // `searchAndContents` is deprecated in exa-js 2.25; `search` with `contents` is its replacement.
    const res = await exa.search(query, { numResults: 5, contents: { text: { maxCharacters: 600 } } })
    return Result.parse({ results: res.results.map((r) => ({ title: r.title ?? r.url, url: r.url, snippet: r.text.slice(0, 600) })) })
  },
  toModelOutput: (r) => ({
    type: 'text',
    value: untrusted('web', r.results.map((x) => `${x.title} (${x.url})\n${x.snippet}`).join('\n\n') || 'No results.', untrustedKey()),
  }),
})

/** Offered only while a skill granting it is active (spec §5). */
export default defineDynamic({
  events: {
    'step.started': async (_event, ctx) => ((await toolGranted(ctx.session.id, 'web_search')) ? tool : null),
  },
})
