import { z } from 'zod'

// @openrouter/ai-sdk-provider@3.1.0 dist/index.js:4527 (and :4667 when streaming) puts the call's USD cost
// at providerMetadata.openrouter.usage.cost.
const Meta = z.object({ openrouter: z.object({ usage: z.object({ cost: z.number().nonnegative().optional() }).optional() }).optional() })

/** OpenRouter's reported USD cost for one call (`providerMetadata.openrouter.usage.cost`), or null. */
export function openRouterCost(providerMetadata: Record<string, unknown>): number | null {
  return Meta.parse(providerMetadata).openrouter?.usage?.cost ?? null
}
