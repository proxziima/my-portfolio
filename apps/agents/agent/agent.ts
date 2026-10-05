import { defineAgent, defineDynamic } from 'eve'
import { currentTier, tierSelection } from './lib/model-router'
import { modelIds, tierModel } from './lib/models'

/** The portfolio twin: one root agent, no subagents (spec §11), with a model tier chosen per turn. */
export default defineAgent({
  description: 'First-person twin of the portfolio owner for recruiters and clients.',
  // The gate picks light, standard or deep before each turn. Each selection carries its own context
  // window, because a dynamic agent cannot set `modelContextWindowTokens` at the top level.
  model: defineDynamic({
    events: {
      // The channel writes the turn's tier before the turn starts, so every step of a turn agrees.
      'step.started': async (_event, ctx) => tierSelection(await currentTier(ctx.session.id)),
    },
  }),
  reasoning: 'low',
  // Summaries always run on the standard tier. Otherwise they would follow whichever tier the turn that
  // crossed the threshold used, and a light turn would summarize on a 200k window.
  compaction: {
    thresholdPercent: 0.8,
    model: tierModel('standard'),
    modelContextWindowTokens: modelIds(process.env).tiers.standard.contextTokens,
  },
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
