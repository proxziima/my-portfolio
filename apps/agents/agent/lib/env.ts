import { agentsEnvSchema, parseEnv, type AgentsEnv } from '@repo/twin/env'

let cached: AgentsEnv | null = null

/**
 * The validated agent env, parsed on first use. Never call at module top level: eve evaluates
 * modules at build time too, where secrets are absent.
 */
export function getEnv(): AgentsEnv {
  cached ??= parseEnv(agentsEnvSchema, process.env)
  return cached
}
