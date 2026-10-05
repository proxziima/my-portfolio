import { z } from 'zod'

const secret = z.string().min(32, 'must be at least 32 characters')
const csv = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.string().min(1)).min(1))

/** True when the runtime knows the IANA zone; rejects typos before they reach Google or Cal.com. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const timeZone = z.string().refine(isTimeZone, 'must be an IANA time zone')

const serviceAccount = z
  .string()
  .transform((b64, ctx) => {
    try {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as unknown
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be base64-encoded JSON' })
      return z.NEVER
    }
  })
  .pipe(z.object({ client_email: z.email(), private_key: z.string().includes('PRIVATE KEY') }))

/**
 * Model defaults, exported because `agent/agent.ts` is evaluated at build time (before the full
 * env exists) and must resolve the same ids as the runtime schema.
 */
export const MODEL_DEFAULTS = {
  model: 'anthropic/claude-sonnet-5.5',
  fallbacks: ['deepseek/deepseek-v4.1-flash'],
  classifier: 'deepseek/deepseek-v4.1-flash',
  contextTokens: 1_000_000,
} as const

/**
 * Optional integrations and the variables each needs. An integration is configured completely or
 * not at all: the twin chats without any of them, and a half-set one fails at startup instead of
 * at the first tool call.
 */
export const INTEGRATIONS = {
  google: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_CALENDAR_ID'],
  cal: ['CAL_LINK', 'CAL_WEBHOOK_SECRET', 'TWIN_BOOKING_REF_SECRET'],
  imessage: ['IMESSAGE_PROJECT_ID', 'IMESSAGE_PROJECT_SECRET', 'IMESSAGE_WEBHOOK_SECRET', 'OWNER_PHONE_NUMBER'],
  exa: ['EXA_API_KEY'],
} as const
export type Integration = keyof typeof INTEGRATIONS

const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, 'must be E.164, e.g. +5511999998888')

const agentsEnvObject = z.object({
  TWIN_DATABASE_URL: z.url(),
  WORKFLOW_POSTGRES_URL: z.url(),
  OPENROUTER_API_KEY: z.string().min(1),
  TWIN_MODEL: z.string().min(1).default(MODEL_DEFAULTS.model),
  TWIN_MODEL_FALLBACKS: csv.default([...MODEL_DEFAULTS.fallbacks]),
  TWIN_MODEL_CONTEXT_TOKENS: z.coerce.number().int().positive().default(MODEL_DEFAULTS.contextTokens),
  TWIN_CLASSIFIER_MODEL: z.string().min(1).default(MODEL_DEFAULTS.classifier),
  TWIN_JWT_SECRET: secret,
  TWIN_PROMPT_CANARY: z.string().min(16),
  TWIN_STABLE_KEY_SECRET: secret,
  TWIN_REDACT_SECRET: secret,
  CMS_URL: z.url(),
  PAYLOAD_MCP_URL: z.url(),
  PAYLOAD_MCP_API_KEY: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_JSON: serviceAccount.optional(),
  GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
  OWNER_TIMEZONE: timeZone,
  CAL_ORIGIN: z.url().default('https://cal.com'),
  // Official embed loader (cal.com docs: embed snippet); differs for self-hosted Cal.diy.
  CAL_EMBED_SCRIPT_URL: z.url().default('https://app.cal.com/embed/embed.js'),
  CAL_LINK: z.string().regex(/^[\w-]+\/[\w-]+$/, 'must be "<user>/<event-slug>"').optional(),
  CAL_WEBHOOK_SECRET: secret.optional(),
  TWIN_BOOKING_REF_SECRET: secret.optional(),
  // Photon (Spectrum Cloud) project credentials, as eve's Photon channel and the adapter name them.
  IMESSAGE_PROJECT_ID: z.string().min(1).optional(),
  IMESSAGE_PROJECT_SECRET: z.string().min(1).optional(),
  // The signing secret Photon returns once, when the webhook is created.
  IMESSAGE_WEBHOOK_SECRET: z.string().min(1).optional(),
  // The only number whose replies decide approvals, and where the prompt is sent.
  OWNER_PHONE_NUMBER: e164.optional(),
  EXA_API_KEY: z.string().min(1).optional(),
  TWIN_APPROVAL_TIMEOUT: z.string().regex(/^\d+(s|m|h)$/).default('15m'),
  TWIN_CLASSIFIER_TIMEOUT_MS: z.coerce.number().int().positive().default(4_000),
  // Shorter than the intent classifier's: the abuse check is on the critical path before every reply.
  TWIN_ABUSE_TIMEOUT_MS: z.coerce.number().int().positive().default(1_500),
})

/** Every variable the agents service reads. Parsed once, lazily, on first use at runtime. */
export const agentsEnvSchema = agentsEnvObject.superRefine((env, ctx) => {
  for (const [name, keys] of Object.entries(INTEGRATIONS)) {
    const set = keys.filter((k) => env[k] !== undefined)
    if (set.length === 0 || set.length === keys.length) continue
    for (const k of keys.filter((k) => env[k] === undefined))
      ctx.addIssue({ code: 'custom', path: [k], message: `required by the ${name} integration because ${set.join(', ')} is set` })
  }
})
export type AgentsEnv = z.infer<typeof agentsEnvSchema>

/** The variables of one integration, all present. */
export type IntegrationConfig<I extends Integration> = {
  [K in (typeof INTEGRATIONS)[I][number]]: NonNullable<AgentsEnv[K]>
}

/** The integration's variables, or null when it isn't configured (the schema rules out half-set). */
export function integrationConfig<I extends Integration>(
  env: Pick<AgentsEnv, (typeof INTEGRATIONS)[I][number]>,
  name: I,
): IntegrationConfig<I> | null {
  const keys: readonly (typeof INTEGRATIONS)[I][number][] = INTEGRATIONS[name]
  if (keys.some((k) => env[k] === undefined)) return null
  return Object.fromEntries(keys.map((k) => [k, env[k]])) as IntegrationConfig<I>
}

/** Like `integrationConfig`, for code only reachable when the integration is on (gated tools). */
export function requireIntegration<I extends Integration>(
  env: Pick<AgentsEnv, (typeof INTEGRATIONS)[I][number]>,
  name: I,
): IntegrationConfig<I> {
  const config = integrationConfig(env, name)
  if (!config) throw new Error(`The ${name} integration is not configured`)
  return config
}

/** Every variable the web BFF reads (server-only; never NEXT_PUBLIC_). */
export const webTwinEnvSchema = z.object({
  TWIN_AGENT_URL: z.url(),
  TWIN_JWT_SECRET: secret,
  TWIN_COOKIE_SECRET: secret,
  TWIN_DATABASE_URL: z.url(),
  TWIN_REDACT_SECRET: secret,
  TWIN_PROMPT_CANARY: z.string().min(16),
  TWIN_DAILY_SPEND_USD: z.coerce.number().positive().default(5),
  CMS_URL: z.url(),
})
export type WebTwinEnv = z.infer<typeof webTwinEnvSchema>

/**
 * An env value with blank (empty or whitespace-only) read as unset. docker-compose renders `${VAR:-}`
 * as '', which must behave like an absent variable. Every reader of the env goes through this, so
 * the schema and the build-time readers (`agent/lib/models.ts`) can't disagree about defaults.
 */
export function blankToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value
}

/** Parses an env source, throwing one error that lists every bad variable. */
export function parseEnv<S extends z.ZodType>(schema: S, source: Record<string, string | undefined>): z.infer<S> {
  const cleaned = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, blankToUndefined(v)]))
  const result = schema.safeParse(cleaned)
  if (result.success) return result.data
  const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid environment:\n${lines.join('\n')}`)
}
