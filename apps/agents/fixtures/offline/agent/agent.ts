import { defineAgent } from 'eve'
import { mockModel } from 'eve/evals'

/**
 * Deterministic model for plumbing evals. Keyword-driven so each eval controls the path:
 * "BOOK" → explicit booking, "PUSH" → hot_tier attempt while cold, "NO" → decline,
 * "FACT" → portfolio search. The disclosure workflow tool is absent: eve compiles workflow directives
 * only inside the app root, so its body is unit-tested in tests/request-disclosure-body.test.ts.
 */
export default defineAgent({
  model: mockModel(({ lastUserMessage, toolResults }) => {
    const text = lastUserMessage ?? ''
    if (toolResults.length > 0) return `ok: ${JSON.stringify(toolResults.at(-1)?.output)}`
    if (text.includes('BOOK')) return { toolCalls: [{ name: 'schedule_call', input: { trigger: 'explicit_request' } }] }
    if (text.includes('PUSH')) return { toolCalls: [{ name: 'schedule_call', input: { trigger: 'hot_tier' } }] }
    if (text.includes('NO')) return { toolCalls: [{ name: 'record_call_decline', input: {} }] }
    if (text.includes('FACT')) return { toolCalls: [{ name: 'search_portfolio', input: { query: 'projects' } }] }
    return 'plain reply'
  }),
  modelContextWindowTokens: 100_000,
  defaultTools: false,
  tool: false,
  // Same durable world as the real agent, so sessions run on Postgres exactly as in production.
  experimental: { workflow: { world: '@workflow/world-postgres', retention: 0 } },
  build: { externalDependencies: ['@workflow/world-postgres', 'pg'] },
})
