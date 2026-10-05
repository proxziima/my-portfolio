import { describe, expect, it } from 'vitest'
import {
  agentsEnvSchema,
  blankToUndefined,
  INTEGRATIONS,
  integrationConfig,
  MODEL_DEFAULTS,
  parseEnv,
  requireIntegration,
  webTwinEnvSchema,
} from '../src/env'

const secret = 'x'.repeat(32)
const sa = Buffer.from(JSON.stringify({ client_email: 'twin@p.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' })).toString('base64')

const agents = {
  TWIN_DATABASE_URL: 'postgres://twin:twin@127.0.0.1:5433/twin',
  WORKFLOW_POSTGRES_URL: 'postgres://twin:twin@127.0.0.1:5433/twin',
  OPENROUTER_API_KEY: 'sk-or-1',
  TWIN_JWT_SECRET: secret,
  TWIN_PROMPT_CANARY: 'canary-0123456789abcdef',
  TWIN_STABLE_KEY_SECRET: secret,
  TWIN_REDACT_SECRET: secret,
  CMS_URL: 'http://localhost:3001',
  PAYLOAD_MCP_URL: 'http://localhost:3001/api/mcp',
  PAYLOAD_MCP_API_KEY: 'k',
  GOOGLE_SERVICE_ACCOUNT_JSON: sa,
  GOOGLE_CALENDAR_ID: 'owner@example.com',
  OWNER_TIMEZONE: 'America/Sao_Paulo',
  CAL_LINK: 'vinicius/intro',
  CAL_WEBHOOK_SECRET: secret,
  TWIN_BOOKING_REF_SECRET: secret,
  IMESSAGE_PROJECT_ID: 'photon-project-1',
  IMESSAGE_PROJECT_SECRET: 'photon-project-secret',
  IMESSAGE_WEBHOOK_SECRET: 'photon-webhook-secret',
  OWNER_PHONE_NUMBER: '+5511999998888',
  EXA_API_KEY: 'exa',
}

describe('env', () => {
  it('parses a complete agents env and applies defaults', () => {
    const env = parseEnv(agentsEnvSchema, agents)
    expect(env.TWIN_MODEL_FALLBACKS).toEqual(['anthropic/claude-haiku-4.5'])
    expect(env.TWIN_APPROVAL_TIMEOUT).toBe('15m')
    expect(requireIntegration(env, 'google').GOOGLE_SERVICE_ACCOUNT_JSON.client_email).toBe('twin@p.iam.gserviceaccount.com')
    expect(env.TWIN_ABUSE_TIMEOUT_MS).toBe(2_500)
    expect(env.CAL_ORIGIN).toBe('https://cal.com')
  })

  it('names every missing or invalid variable in one error', () => {
    expect(() => parseEnv(agentsEnvSchema, { ...agents, OPENROUTER_API_KEY: '', OWNER_TIMEZONE: 'Mars/Base' })).toThrow(
      /OPENROUTER_API_KEY[\s\S]*OWNER_TIMEZONE/,
    )
  })

  it('treats empty strings as unset so defaults apply', () => {
    expect(parseEnv(agentsEnvSchema, { ...agents, TWIN_MODEL: '' }).TWIN_MODEL).toBe('deepseek/deepseek-v4.1-flash')
  })

  it('treats whitespace-only values as unset too', () => {
    const env = parseEnv(agentsEnvSchema, { ...agents, TWIN_MODEL_FALLBACKS: '  ', TWIN_MODEL_CONTEXT_TOKENS: ' ' })
    expect(env.TWIN_MODEL_FALLBACKS).toEqual(['anthropic/claude-haiku-4.5'])
    expect(env.TWIN_MODEL_CONTEXT_TOKENS).toBe(1_000_000)
  })

  it('defaults the light and deep tiers and lets each be overridden', () => {
    const env = parseEnv(agentsEnvSchema, agents)
    expect(env.TWIN_MODEL_LIGHT).toBe('deepseek/deepseek-v4.1-flash')
    expect(env.TWIN_MODEL_LIGHT_CONTEXT_TOKENS).toBe(1_000_000)
    expect(env.TWIN_MODEL_DEEP).toBe('anthropic/claude-opus-5.5')
    expect(env.TWIN_MODEL_DEEP_CONTEXT_TOKENS).toBe(1_000_000)
    const custom = parseEnv(agentsEnvSchema, {
      ...agents,
      TWIN_MODEL_LIGHT: 'a/light',
      TWIN_MODEL_LIGHT_CONTEXT_TOKENS: '64000',
      TWIN_MODEL_DEEP: 'a/deep',
      TWIN_MODEL_DEEP_CONTEXT_TOKENS: '500000',
    })
    expect([custom.TWIN_MODEL_LIGHT, custom.TWIN_MODEL_LIGHT_CONTEXT_TOKENS, custom.TWIN_MODEL_DEEP, custom.TWIN_MODEL_DEEP_CONTEXT_TOKENS]).toEqual(['a/light', 64_000, 'a/deep', 500_000])
  })

  // Owner policy (2026-10-05): models come from Anthropic, DeepSeek or OpenAI only.
  it('defaults every model to an allowed provider, each classifier failing over to another provider', () => {
    const ids = Object.values(MODEL_DEFAULTS)
      .flat()
      .filter((v) => typeof v === 'string')
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(id).toMatch(/^(anthropic|deepseek|openai)\//)
    const provider = (id: string) => id.split('/')[0]
    expect(provider(MODEL_DEFAULTS.classifierFallback)).not.toBe(provider(MODEL_DEFAULTS.classifier))
    expect(provider(MODEL_DEFAULTS.intentFallback)).not.toBe(provider(MODEL_DEFAULTS.intent))
  })

  it('defaults the intent model apart from the gate classifier, blank meaning unset', () => {
    const env = parseEnv(agentsEnvSchema, agents)
    expect(env.TWIN_INTENT_MODEL).toBe('anthropic/claude-haiku-4.5')
    expect(env.TWIN_CLASSIFIER_MODEL).toBe('openai/gpt-4.1-mini')
    expect(parseEnv(agentsEnvSchema, { ...agents, TWIN_INTENT_MODEL: ' ' }).TWIN_INTENT_MODEL).toBe('anthropic/claude-haiku-4.5')
    expect(parseEnv(agentsEnvSchema, { ...agents, TWIN_INTENT_MODEL: 'a/intent' }).TWIN_INTENT_MODEL).toBe('a/intent')
  })

  it('treats blank tier variables as unset so the tier defaults apply', () => {
    const env = parseEnv(agentsEnvSchema, { ...agents, TWIN_MODEL_LIGHT: '', TWIN_MODEL_DEEP_CONTEXT_TOKENS: ' ' })
    expect(env.TWIN_MODEL_LIGHT).toBe('deepseek/deepseek-v4.1-flash')
    expect(env.TWIN_MODEL_DEEP_CONTEXT_TOKENS).toBe(1_000_000)
  })

  it('blankToUndefined keeps non-blank values untouched', () => {
    expect([undefined, '', ' 	', 'a', ' a '].map(blankToUndefined)).toEqual([undefined, undefined, undefined, 'a', ' a '])
  })

  it('still rejects an empty required variable', () => {
    expect(() => parseEnv(agentsEnvSchema, { ...agents, CMS_URL: '' })).toThrow(/CMS_URL/)
  })

  it('parses without any optional integration, each reported as off', () => {
    const core = Object.fromEntries(
      Object.entries(agents).filter(([k]) => !Object.values(INTEGRATIONS).flat().some((i) => i === k)),
    )
    const env = parseEnv(agentsEnvSchema, core)
    for (const name of ['google', 'cal', 'imessage', 'exa'] as const) {
      expect(integrationConfig(env, name)).toBeNull()
      expect(() => requireIntegration(env, name)).toThrow(`The ${name} integration is not configured`)
    }
  })

  it('treats blank integration variables as unset', () => {
    const env = parseEnv(agentsEnvSchema, { ...agents, EXA_API_KEY: '' })
    expect(integrationConfig(env, 'exa')).toBeNull()
    expect(integrationConfig(env, 'cal')?.CAL_LINK).toBe('vinicius/intro')
  })

  it('rejects a half-configured integration, naming what is missing', () => {
    expect(() => parseEnv(agentsEnvSchema, { ...agents, OWNER_PHONE_NUMBER: '' })).toThrow(
      /OWNER_PHONE_NUMBER: required by the imessage integration because IMESSAGE_PROJECT_ID, IMESSAGE_PROJECT_SECRET, IMESSAGE_WEBHOOK_SECRET is set/,
    )
  })

  it('requires E.164 phone numbers', () => {
    expect(() => parseEnv(agentsEnvSchema, { ...agents, OWNER_PHONE_NUMBER: '11 99999-8888' })).toThrow(/OWNER_PHONE_NUMBER: must be E.164/)
  })

  it('parses the web BFF env', () => {
    const env = parseEnv(webTwinEnvSchema, {
      TWIN_AGENT_URL: 'http://agents:3000',
      TWIN_JWT_SECRET: secret,
      TWIN_COOKIE_SECRET: secret,
      TWIN_DATABASE_URL: agents.TWIN_DATABASE_URL,
      TWIN_REDACT_SECRET: secret,
      TWIN_PROMPT_CANARY: agents.TWIN_PROMPT_CANARY,
      CMS_URL: 'http://cms:3001',
    })
    expect(env.TWIN_DAILY_SPEND_USD).toBe(5)
  })
})
