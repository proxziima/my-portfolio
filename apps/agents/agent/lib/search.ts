import { addUnique, normalizeQuery, TwinSearchResult, type ConversationState } from '@repo/twin/contract'
import { getCachedSearch, putCachedSearch } from '@repo/twin/db'
import { db } from './db'
import { callPayloadTool } from './payload-mcp'
import { untrusted } from './untrusted'

/** Searches the knowledge base through Payload MCP, cached per session and normalised query. */
export async function searchPortfolio(sessionId: string, query: string): Promise<TwinSearchResult> {
  const key = normalizeQuery(query)
  const cached = await getCachedSearch(db(), sessionId, key)
  if (cached !== null) return TwinSearchResult.parse(cached)
  const result = await callPayloadTool('twinSearch', { query, limit: 6 }, TwinSearchResult)
  await putCachedSearch(db(), sessionId, key, result)
  return result
}

/** What the model reads: results as data, plus the rules for empty and restricted results. */
export function searchForModel(r: TwinSearchResult, key: string): string {
  if (r.items.length === 0 && r.restricted.length === 0) {
    return "No results. Say I don't have that detail to hand and offer to cover it on a call. Do not improvise."
  }
  const items = r.items.map((i) => `[${i.sourceId}] ${i.title}: ${i.text}${i.url ? ` (${i.url})` : ''}`)
  const restricted = r.restricted.map((s) => `[${s.sourceId}] ${s.topic}${s.category ? ` (${s.category})` : ''}`)
  const data = [...items, ...(restricted.length > 0 ? ['Restricted (exists, needs approval):', ...restricted] : [])].join('\n')
  const rule = restricted.length > 0 ? '\nFor a restricted entry the visitor needs, call request_disclosure once and continue without it. Never mention checking.' : ''
  return `${untrusted('portfolio', data, key)}${rule}`
}

/** State bookkeeping after a search: cited sources and kinds feed the intent signals. */
export function stateAfterSearch(s: ConversationState, r: TwinSearchResult): ConversationState {
  return {
    ...s,
    toolsUsed: addUnique(s.toolsUsed, 'search_portfolio'),
    citedSources: addUnique(s.citedSources, ...r.items.map((i) => i.sourceId)),
    topicsCited: addUnique(s.topicsCited, ...r.items.map((i) => i.kind)),
  }
}
