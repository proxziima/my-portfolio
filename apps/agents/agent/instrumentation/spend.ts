import { recordSpend } from '@repo/twin/db'
import { defineInstrumentation } from 'eve/instrumentation'
import { db } from '../lib/db'
import { openRouterCost } from '../lib/spend'

/**
 * Feeds the daily spend cap the BFF enforces (spec §10).
 *
 * eve reports tokens (`model.call.completed`, keyed per provider call) and provider metadata
 * (`step.attempt.metadata`, keyed per attempt) on different events with DIFFERENT idempotency
 * keys, so they land as two rows that the cap sums: tokens with cost 0, and the cost with no tokens.
 * `model.call.completed.usage` carries no `costUsd` (eve only fills it for the AI Gateway), so the
 * cost comes solely from OpenRouter's provider metadata.
 *
 * A thrown `recordSpend` is caught and logged (warn, "instrumentation provider failed") by eve's
 * dispatcher and never fails the turn; the ledger row is then lost, so keep the DB reachable.
 */
export default defineInstrumentation({
  // recordOutputs must be true: with it off, eve strips `step.attempt.metadata.providerMetadata`
  // down to `gateway.cost` only, which would erase `openrouter.usage.cost`. Only this handler sees
  // it and nothing here persists model content.
  tracePolicy: () => ({ emit: true, recordInputs: false, recordOutputs: true }),
  events: {
    'model.call.started': (e, ctx) => ctx.state.set({ modelId: e.model.modelId }),
    'model.call.completed': async (e, ctx) => {
      const modelId = (ctx.state.get() as { modelId?: string } | undefined)?.modelId ?? e.responseModelId ?? 'unknown'
      await recordSpend(db(), {
        idempotencyKey: e.idempotencyKey,
        sessionId: e.scope.sessionId,
        modelId,
        costUsd: 0,
        inputTokens: e.usage.inputTokens ?? 0,
        outputTokens: e.usage.outputTokens ?? 0,
      })
    },
    'step.attempt.metadata': async (e) => {
      const cost = openRouterCost(e.providerMetadata as Record<string, unknown>)
      if (cost === null) return
      await recordSpend(db(), {
        idempotencyKey: e.idempotencyKey,
        sessionId: e.scope.sessionId,
        modelId: 'openrouter',
        costUsd: cost,
        inputTokens: 0,
        outputTokens: 0,
      })
    },
  },
})
