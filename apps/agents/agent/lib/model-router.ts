import type { ModelTier } from '@repo/twin/contract'
import { getConversation } from '@repo/twin/db'
import { db } from './db'
import { modelIds, tierModel } from './models'

/** The tier the session's current turn runs on; `standard` when it can't be read. */
export async function currentTier(sessionId: string): Promise<ModelTier> {
  // A throwing resolver fails the turn, so a failed read degrades to today's model instead.
  try {
    return (await getConversation(db(), sessionId))?.state.modelTier ?? 'standard'
  } catch (e) {
    console.error('[twin] model tier read failed; using standard', e instanceof Error ? e.message : e)
    return 'standard'
  }
}

/** eve's model selection for a tier: the OpenRouter chain, its context window and reasoning effort. */
export function tierSelection(tier: ModelTier) {
  const { contextTokens, reasoning } = modelIds(process.env).tiers[tier]
  // The window must be explicit: OpenRouter models are not in the AI Gateway catalog eve falls back to.
  return { model: tierModel(tier), modelContextWindowTokens: contextTokens, reasoning }
}
