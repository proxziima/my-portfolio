import { defineAgent } from 'eve'
import { MODEL_DEFAULTS } from '@repo/twin/env'
import { twinModel } from './lib/models'

/** The portfolio twin: one root agent, no subagents (spec §11). */
export default defineAgent({
  description: 'First-person twin of the portfolio owner for recruiters and clients.',
  model: twinModel(),
  // OpenRouter models are not in the AI Gateway catalog, so the window must be explicit. An empty
  // var counts as absent (Number('') would be 0).
  modelContextWindowTokens: Number(process.env.TWIN_MODEL_CONTEXT_TOKENS || MODEL_DEFAULTS.contextTokens),
  reasoning: 'low',
  compaction: { thresholdPercent: 0.8 },
  limits: {
    maxInputTokensPerSession: 600_000,
    maxOutputTokensPerSession: 60_000,
    sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
  },
  // Visitors are anonymous: no shell, files, web fetch, subagents or lazy skills (spec §1).
  defaultTools: false,
  tool: false,
  experimental: { workflow: { world: '@workflow/world-postgres', retention: 0 } },
  build: { externalDependencies: ['@workflow/world-postgres', 'pg'] },
})
