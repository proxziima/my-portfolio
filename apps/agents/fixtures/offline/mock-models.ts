import type { ModelTier } from '@repo/twin/contract'

/** The provider name of every scripted model; eve reports a step's model as `<provider>/<id>`. */
export const MOCK_PROVIDER = 'offline-fixture'

/** The scripted model id of each routing tier; distinct so an eval can tell which tier a step ran on. */
export const MOCK_MODEL_IDS: Record<ModelTier, string> = {
  light: 'offline-mock-light',
  standard: 'offline-mock-standard',
  deep: 'offline-mock-deep',
}

/** The `modelId` a `step.started` event carries for a tier's scripted model. */
export function mockEventModelId(tier: ModelTier): string {
  return `${MOCK_PROVIDER}/${MOCK_MODEL_IDS[tier]}`
}
