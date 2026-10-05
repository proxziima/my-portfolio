import { TwinIdentity } from '@repo/twin/contract'
import { groundingBlock } from './conversation'
import { callPayloadTool } from './payload-mcp'
import { ttlCache } from './ttl-cache'
import { untrustedKey } from './untrusted'

export const GROUNDING_TTL_MS = 5 * 60 * 1000

/**
 * The grounding block, fetched from the CMS at most every 5 minutes per process. A failed refresh
 * serves the stale block; with none cached it throws, and the turn prompt falls back (lib/prompt).
 */
export const cachedGrounding = ttlCache(
  async () => groundingBlock(await callPayloadTool('twinIdentity', {}, TwinIdentity), untrustedKey()),
  GROUNDING_TTL_MS,
)
