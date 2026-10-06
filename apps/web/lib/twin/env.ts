import 'server-only'
import { parseEnv, webTwinEnvSchema, type WebTwinEnv } from '@repo/twin/env'

let cached: WebTwinEnv | null = null

/** The validated BFF env, parsed on first request (build time has no secrets). */
export function twinEnv(): WebTwinEnv {
  cached ??= parseEnv(webTwinEnvSchema, process.env)
  return cached
}
