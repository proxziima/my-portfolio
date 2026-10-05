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

/** Every variable the agents service reads. Parsed once, lazily, on first use at runtime. */
export const agentsEnvSchema = z.object({
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
  GOOGLE_SERVICE_ACCOUNT_JSON: serviceAccount,
  GOOGLE_CALENDAR_ID: z.string().min(1),
  OWNER_TIMEZONE: timeZone,
  CAL_ORIGIN: z.url().default('https://cal.com'),
  // Official embed loader (cal.com docs: embed snippet); differs for self-hosted Cal.diy.
  CAL_EMBED_SCRIPT_URL: z.url().default('https://app.cal.com/embed/embed.js'),
  CAL_LINK: z.string().regex(/^[\w-]+\/[\w-]+$/, 'must be "<user>/<event-slug>"'),
  CAL_WEBHOOK_SECRET: secret,
  TWIN_BOOKING_REF_SECRET: secret,
  // Bot API base URL; Telegram documents running a local Bot API server, and offline evals use a stub.
  TELEGRAM_API_BASE: z.url().default('https://api.telegram.org'),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[\w-]{16,256}$/),
  TELEGRAM_OWNER_USER_ID: z.string().regex(/^\d+$/),
  EXA_API_KEY: z.string().min(1),
  TWIN_APPROVAL_TIMEOUT: z.string().regex(/^\d+(s|m|h)$/).default('15m'),
  TWIN_CLASSIFIER_TIMEOUT_MS: z.coerce.number().int().positive().default(4_000),
  // Shorter than the intent classifier's: the abuse check is on the critical path before every reply.
  TWIN_ABUSE_TIMEOUT_MS: z.coerce.number().int().positive().default(1_500),
})
export type AgentsEnv = z.infer<typeof agentsEnvSchema>

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

/** Parses an env source, throwing one error that lists every bad variable. */
export function parseEnv<S extends z.ZodType>(schema: S, source: Record<string, string | undefined>): z.infer<S> {
  // docker-compose renders `${VAR:-}` as '', which must behave like an unset variable.
  const cleaned = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v === '' ? undefined : v]))
  const result = schema.safeParse(cleaned)
  if (result.success) return result.data
  const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid environment:\n${lines.join('\n')}`)
}
