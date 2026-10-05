import { describe, expect, it } from 'vitest'
import { agentsEnvSchema, parseEnv, webTwinEnvSchema } from '../src/env'

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
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_WEBHOOK_SECRET: 'tg_secret_value_1234',
  TELEGRAM_OWNER_USER_ID: '42',
  EXA_API_KEY: 'exa',
}

describe('env', () => {
  it('parses a complete agents env and applies defaults', () => {
    const env = parseEnv(agentsEnvSchema, agents)
    expect(env.TWIN_MODEL_FALLBACKS).toEqual(['deepseek/deepseek-v4.1-flash'])
    expect(env.TWIN_APPROVAL_TIMEOUT).toBe('15m')
    expect(env.GOOGLE_SERVICE_ACCOUNT_JSON.client_email).toBe('twin@p.iam.gserviceaccount.com')
    expect(env.CAL_ORIGIN).toBe('https://cal.com')
  })

  it('names every missing or invalid variable in one error', () => {
    expect(() => parseEnv(agentsEnvSchema, { ...agents, OPENROUTER_API_KEY: '', OWNER_TIMEZONE: 'Mars/Base' })).toThrow(
      /OPENROUTER_API_KEY[\s\S]*OWNER_TIMEZONE/,
    )
  })

  it('treats empty strings as unset so defaults apply', () => {
    expect(parseEnv(agentsEnvSchema, { ...agents, TWIN_MODEL: '' }).TWIN_MODEL).toBe('anthropic/claude-sonnet-5.5')
  })

  it('still rejects an empty required variable', () => {
    expect(() => parseEnv(agentsEnvSchema, { ...agents, CMS_URL: '' })).toThrow(/CMS_URL/)
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
