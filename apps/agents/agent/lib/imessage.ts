import { createiMessageAdapter, type iMessageAdapter } from '@photon-ai/chat-adapter-imessage'
import { integrationConfig, requireIntegration } from '@repo/twin/env'
import { FatalError } from 'workflow'
import { getEnv } from './env'

/**
 * Photon project credentials from the `imessage` integration. Passed as a lazy provider (eve's
 * "Other hosts" pattern): eve evaluates modules at build time, where secrets are absent.
 */
export function photonCredentials(): { projectId: string; projectSecret: string } {
  const im = requireIntegration(getEnv(), 'imessage')
  return { projectId: im.IMESSAGE_PROJECT_ID, projectSecret: im.IMESSAGE_PROJECT_SECRET }
}

let adapter: iMessageAdapter | null = null

/**
 * Texts the owner through Photon and returns the sent message id. Provider API, not an agent turn
 * (eve: durable cross-channel notifications), on the adapter eve's Photon channel bundles; `openDM`
 * resolves or creates the 1:1 chat, so the owner needn't have a live session. An unconfigured
 * integration is permanent (`FatalError`); adapter failures stay retryable for the workflow step,
 * since the adapter exposes no permanent-error classification to rely on.
 */
export async function sendToOwner(text: string): Promise<string> {
  const im = integrationConfig(getEnv(), 'imessage')
  if (!im) throw new FatalError('iMessage is not configured')
  adapter ??= createiMessageAdapter({ credentials: photonCredentials })
  try {
    const threadId = await adapter.openDM(im.OWNER_PHONE_NUMBER)
    const sent = await adapter.postMessage(threadId, text)
    return sent.id
  } catch (e) {
    throw new Error('Photon send failed', { cause: e })
  }
}
