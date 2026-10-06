import { z } from 'zod'

/**
 * Guardrail numbers in one typed place (spec §10). Change them here; the BFF and the agent read
 * the same object, so they can't drift apart.
 */
export const TWIN_LIMITS = {
  ipPerMinute: 12,
  ipPerDay: 300,
  sessionPerMinute: 8,
  sessionPerDay: 120,
  messageMaxChars: 1_000,
  maxTurnsPerConversation: 40,
  maxViolations: 3,
  // Owner approvals one conversation may open; further requests are auto-denied silently.
  maxApprovalsPerSession: 3,
  retentionDays: 90,
} as const

/** Replaces a reply that leaked the prompt canary; the BFF swaps it in at the output boundary. */
export const LEAK_DEFLECTION = "Ha, I'll keep how I work to myself. Happy to talk about what I've built, though."

/** HTTP status the BFF uses per refusal kind; the window maps status → CMS label. */
export const REFUSAL_STATUS = { throttled: 429, too_long: 413, ended: 403, offline: 503 } as const

/** Body of every refusal the BFF returns, so the window can show the matching CMS label. */
export const TwinRefusal = z.object({
  ok: z.literal(false),
  kind: z.enum(['throttled', 'ended', 'too_long', 'offline']),
})
export type TwinRefusal = z.infer<typeof TwinRefusal>
