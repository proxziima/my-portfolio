import type { ModelTier } from '@repo/twin/contract'
import { defineAgent, defineDynamic } from 'eve'
import { mockModel, type MockModelResponder } from 'eve/evals'
import { currentTier } from '../../../agent/lib/model-router'
import { MOCK_MODEL_IDS, MOCK_PROVIDER } from '../mock-models'

/**
 * Scripted reply, keyword-driven so each eval controls the path:
 * "BOOK" → explicit booking, "PUSH" → hot_tier attempt while cold, "NO" → decline,
 * "FACT" → portfolio search. The disclosure workflow tool is absent: eve compiles workflow directives
 * only inside the app root, so its body is unit-tested in tests/request-disclosure-body.test.ts.
 */
const respond: MockModelResponder = ({ lastUserMessage, messages, toolResults }) => {
  const text = lastUserMessage ?? ''
  // `toolResults` spans the whole conversation, so only a tool result after the latest user
  // message means this step answers a call made in the current turn.
  const lastUser = messages.map((m) => m.role === 'user' && m.text === lastUserMessage).lastIndexOf(true)
  if (messages.slice(lastUser + 1).some((m) => m.role === 'tool'))
    return `ok: ${JSON.stringify(toolResults.at(-1)?.output)}`
  if (text.includes('BOOK'))
    return { toolCalls: [{ name: 'schedule_call', input: { trigger: 'explicit_request' } }] }
  if (text.includes('PUSH'))
    return { toolCalls: [{ name: 'schedule_call', input: { trigger: 'hot_tier' } }] }
  if (text.includes('NO')) return { toolCalls: [{ name: 'record_call_decline', input: {} }] }
  if (text.includes('FACT'))
    return { toolCalls: [{ name: 'search_portfolio', input: { query: 'projects' } }] }
  return 'plain reply'
}

/** One scripted model per routing tier, each with its own id so an eval can tell which tier a step ran on. */
const mocks = Object.fromEntries(
  (Object.keys(MOCK_MODEL_IDS) as ModelTier[]).map((tier) => [
    tier,
    mockModel({ modelId: MOCK_MODEL_IDS[tier], provider: MOCK_PROVIDER, respond }),
  ]),
) as Record<ModelTier, ReturnType<typeof mockModel>>

/**
 * Deterministic model for plumbing evals, chosen per step through the same resolver as the real agent:
 * `currentTier` reads the tier the channel stored for the turn. The fixture's gate times out by design
 * (`TWIN_ABUSE_TIMEOUT_MS=1`), so turns run on the standard mock.
 */
export default defineAgent({
  model: defineDynamic({
    events: {
      'step.started': async (_event, ctx) => ({
        model: mocks[await currentTier(ctx.session.id)],
        modelContextWindowTokens: 100_000,
      }),
    },
  }),
  defaultTools: false,
  tool: false,
  // Same durable world as the real agent, so sessions run on Postgres exactly as in production.
  experimental: { workflow: { world: '@workflow/world-postgres', retention: 0 } },
  build: { externalDependencies: ['@workflow/world-postgres', 'pg'] },
})
